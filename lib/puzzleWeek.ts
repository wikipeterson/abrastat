import { User } from 'firebase/auth'
import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { canRegisterForPuzzleWeek, getPuzzleWeekEligibilityMessage } from './featureFlags'

export const CURRENT_PUZZLE_WEEK_EVENT = {
  id: 'puzzle-week-2026',
  slug: 'puzzleweek',
  title: 'Puzzle Week',
} as const

export type PuzzleWeekEntryType = 'solo' | 'team'

export interface PuzzleWeekEntry {
  id: string
  eventId: string
  type: PuzzleWeekEntryType
  name: string
  joinCode: string | null
  isLocked: boolean
  createdAt: Date | null
}

export interface PuzzleWeekMember {
  id: string
  eventId: string
  entryId: string
  userId: string
  displayName: string
  email: string
  joinedAt: Date | null
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function mapEntry(data: Record<string, unknown>, id: string): PuzzleWeekEntry {
  return {
    id,
    eventId: String(data.eventId ?? ''),
    type: (data.type === 'team' ? 'team' : 'solo') as PuzzleWeekEntryType,
    name: String(data.name ?? ''),
    joinCode: typeof data.joinCode === 'string' ? data.joinCode : null,
    isLocked: Boolean(data.isLocked),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  }
}

function mapMember(data: Record<string, unknown>, id: string): PuzzleWeekMember {
  return {
    id,
    eventId: String(data.eventId ?? ''),
    entryId: String(data.entryId ?? ''),
    userId: String(data.userId ?? ''),
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toDate() : null,
  }
}

function makeJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

async function getExistingJoinCodeEntry(eventId: string, joinCode: string) {
  const snap = await getDocs(
    query(
      collection(db, 'puzzleWeekEntries'),
      where('eventId', '==', eventId),
      where('joinCode', '==', joinCode),
      limit(1),
    ),
  )
  const docSnap = snap.docs[0]
  if (!docSnap) return null
  return mapEntry(docSnap.data() as Record<string, unknown>, docSnap.id)
}

async function generateUniqueJoinCode(eventId: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const joinCode = makeJoinCode()
    const existing = await getExistingJoinCodeEntry(eventId, joinCode)
    if (!existing) return joinCode
  }
  throw new Error('Could not generate a unique team code. Please try again.')
}

async function addMembership(entryId: string, eventId: string, user: User) {
  await addDoc(collection(db, 'puzzleWeekEntryMembers'), {
    eventId,
    entryId,
    userId: user.uid,
    displayName: user.displayName ?? user.email ?? 'Participant',
    email: user.email ?? '',
    joinedAt: serverTimestamp(),
  })
}

function assertPuzzleWeekEligibility(user: User) {
  if (!canRegisterForPuzzleWeek(user)) {
    throw new Error(getPuzzleWeekEligibilityMessage())
  }
}

async function getExistingMembershipDoc(eventId: string, userId: string) {
  const membershipSnap = await getDocs(
    query(
      collection(db, 'puzzleWeekEntryMembers'),
      where('eventId', '==', eventId),
      where('userId', '==', userId),
      limit(1),
    ),
  )

  return membershipSnap.docs[0] ?? null
}

export async function getPuzzleWeekRegistration(eventId: string, userId: string): Promise<{
  entry: PuzzleWeekEntry | null
  members: PuzzleWeekMember[]
}> {
  const membershipDoc = await getExistingMembershipDoc(eventId, userId)
  if (!membershipDoc) {
    return { entry: null, members: [] }
  }

  const membership = mapMember(membershipDoc.data() as Record<string, unknown>, membershipDoc.id)
  const entrySnap = await getDocs(
    query(
      collection(db, 'puzzleWeekEntries'),
      where('eventId', '==', eventId),
      where('__name__', '==', membership.entryId),
      limit(1),
    ),
  )

  const entryDoc = entrySnap.docs[0]
  if (!entryDoc) {
    return { entry: null, members: [] }
  }

  const membersSnap = await getDocs(
    query(
      collection(db, 'puzzleWeekEntryMembers'),
      where('eventId', '==', eventId),
      where('entryId', '==', membership.entryId),
    ),
  )

  return {
    entry: mapEntry(entryDoc.data() as Record<string, unknown>, entryDoc.id),
    members: membersSnap.docs.map(docSnap => mapMember(docSnap.data() as Record<string, unknown>, docSnap.id)),
  }
}

export async function registerPuzzleWeekSolo(eventId: string, user: User) {
  assertPuzzleWeekEligibility(user)
  const existing = await getPuzzleWeekRegistration(eventId, user.uid)
  if (existing.entry) {
    throw new Error('You are already registered for this Puzzle Week.')
  }

  const entryRef = await addDoc(collection(db, 'puzzleWeekEntries'), {
    eventId,
    type: 'solo',
    name: normalizeName(user.displayName ?? user.email ?? 'Solo Player'),
    joinCode: null,
    isLocked: false,
    createdAt: serverTimestamp(),
  })

  await addMembership(entryRef.id, eventId, user)
}

export async function registerPuzzleWeekTeam(eventId: string, user: User, teamName: string) {
  assertPuzzleWeekEligibility(user)
  const name = normalizeName(teamName)
  if (!name) throw new Error('Enter a team name.')

  const existing = await getPuzzleWeekRegistration(eventId, user.uid)
  if (existing.entry) {
    throw new Error('You are already registered for this Puzzle Week.')
  }

  const joinCode = await generateUniqueJoinCode(eventId)
  const entryRef = await addDoc(collection(db, 'puzzleWeekEntries'), {
    eventId,
    type: 'team',
    name,
    joinCode,
    isLocked: false,
    createdAt: serverTimestamp(),
  })

  await addMembership(entryRef.id, eventId, user)
}

export async function joinPuzzleWeekTeam(eventId: string, user: User, rawJoinCode: string) {
  assertPuzzleWeekEligibility(user)
  const joinCode = rawJoinCode.trim().toUpperCase()
  if (!joinCode) throw new Error('Enter a join code.')

  const membershipDoc = await getExistingMembershipDoc(eventId, user.uid)
  const existing = membershipDoc ? await getPuzzleWeekRegistration(eventId, user.uid) : { entry: null, members: [] }
  if (existing.entry?.type === 'team') {
    throw new Error('You are already registered on a team for this Puzzle Week.')
  }

  const entry = await getExistingJoinCodeEntry(eventId, joinCode)
  if (!entry || entry.type !== 'team') {
    throw new Error('We could not find that team code.')
  }
  if (entry.isLocked) {
    throw new Error('This team is locked and can’t accept new members.')
  }

  if (!membershipDoc) {
    await addMembership(entry.id, eventId, user)
    return
  }

  await updateDoc(membershipDoc.ref, {
    entryId: entry.id,
    displayName: user.displayName ?? user.email ?? 'Participant',
    email: user.email ?? '',
    joinedAt: serverTimestamp(),
  })
}
