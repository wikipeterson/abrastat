import { User } from 'firebase/auth'
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
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

export const PUZZLE_WEEK_MAX_TEAM_SIZE = 5

export interface PuzzleWeekPuzzle {
  id: string
  title: string
  acceptedAnswers: string[]
}

export const PUZZLE_WEEK_PUZZLES: PuzzleWeekPuzzle[] = [
  { id: 'puzzle-1', title: 'Day 1: Trading Car[d]s', acceptedAnswers: ['SYDNEY'] },
  { id: 'puzzle-2', title: 'Day 2: Its-a-me and my friends', acceptedAnswers: ['MIYAMOTO'] },
  { id: 'puzzle-3', title: 'Day 3: Connect 4', acceptedAnswers: ['NICK FOLES'] },
  { id: 'puzzle-4', title: 'Day 4: Development Review Boardn', acceptedAnswers: ['BULLDOG'] },
  { id: 'puzzle-5', title: 'Day 5: Find the Math Teachers', acceptedAnswers: ['PRIME MERIDIAN'] },
  { id: 'puzzle-6', title: 'Day 6: Mischief Managed', acceptedAnswers: ['PRINCIPAL DONAGHY'] },
  { id: 'puzzle-7', title: 'Metapuzzle: Graph of the (Day, ?)', acceptedAnswers: ['AG CORNOG'] },
] as const

export type PuzzleWeekEntryType = 'solo' | 'team'

export interface PuzzleWeekEntry {
  id: string
  eventId: string
  type: PuzzleWeekEntryType
  name: string
  joinCode: string | null
  isLocked: boolean
  status: 'active' | 'merged'
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

export interface PuzzleWeekProgress {
  puzzleId: string
  entryId: string
  eventId: string
  solved: boolean
  solvedAt: Date | null
}

interface PuzzleWeekJoinCodeRecord {
  entryId: string
  eventId: string
  joinCode: string
}

export interface PuzzleWeekAnswerResult {
  correct: boolean
  message: string
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
}

function mapEntry(data: Record<string, unknown>, id: string): PuzzleWeekEntry {
  return {
    id,
    eventId: String(data.eventId ?? ''),
    type: (data.type === 'team' ? 'team' : 'solo') as PuzzleWeekEntryType,
    name: String(data.name ?? ''),
    joinCode: typeof data.joinCode === 'string' ? data.joinCode : null,
    isLocked: Boolean(data.isLocked),
    status: data.status === 'merged' ? 'merged' : 'active',
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

function mapProgress(data: Record<string, unknown>, id: string): PuzzleWeekProgress {
  return {
    puzzleId: typeof data.puzzleId === 'string' ? data.puzzleId : id,
    entryId: String(data.entryId ?? ''),
    eventId: String(data.eventId ?? ''),
    solved: Boolean(data.solved),
    solvedAt: data.solvedAt instanceof Timestamp ? data.solvedAt.toDate() : null,
  }
}

function mapJoinCodeRecord(data: Record<string, unknown>): PuzzleWeekJoinCodeRecord {
  return {
    entryId: String(data.entryId ?? ''),
    eventId: String(data.eventId ?? ''),
    joinCode: String(data.joinCode ?? ''),
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
  const joinCodeRef = doc(db, 'puzzleWeekJoinCodes', `${eventId}__${joinCode}`)
  const joinCodeSnap = await getDoc(joinCodeRef)
  if (joinCodeSnap.exists()) {
    const joinCodeRecord = mapJoinCodeRecord(joinCodeSnap.data() as Record<string, unknown>)
    const entry = await getEntryById(eventId, joinCodeRecord.entryId)
    if (entry) return entry
  }

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

async function getEntryById(eventId: string, entryId: string): Promise<PuzzleWeekEntry | null> {
  const entrySnap = await getDoc(doc(db, 'puzzleWeekEntries', entryId))
  if (!entrySnap.exists()) return null
  const entry = mapEntry(entrySnap.data() as Record<string, unknown>, entrySnap.id)
  if (entry.eventId !== eventId) return null
  return entry
}

async function getJoinCodeForEntry(eventId: string, entryId: string): Promise<string | null> {
  const joinCodeSnap = await getDocs(
    query(
      collection(db, 'puzzleWeekJoinCodes'),
      where('eventId', '==', eventId),
      where('entryId', '==', entryId),
      limit(1),
    ),
  )
  const joinCodeDoc = joinCodeSnap.docs[0]
  if (joinCodeDoc) {
    return mapJoinCodeRecord(joinCodeDoc.data() as Record<string, unknown>).joinCode || null
  }
  const legacyEntry = await getEntryById(eventId, entryId)
  return legacyEntry?.joinCode ?? null
}

async function getEntryMembers(eventId: string, entryId: string): Promise<PuzzleWeekMember[]> {
  const membersSnap = await getDocs(
    query(
      collection(db, 'puzzleWeekEntryMembers'),
      where('eventId', '==', eventId),
      where('entryId', '==', entryId),
    ),
  )

  return membersSnap.docs.map(docSnap => mapMember(docSnap.data() as Record<string, unknown>, docSnap.id))
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

async function getSolvedProgressMap(eventId: string, entryId: string) {
  const progress = await getPuzzleWeekProgress(eventId, entryId)
  return new Map(progress.filter(item => item.solved).map(item => [item.puzzleId, item] as const))
}

async function updateLeaderboardSnapshot(entry: PuzzleWeekEntry, solvedProgress: PuzzleWeekProgress[], active = true) {
  const lastSolvedAt = solvedProgress.reduce<Date | null>((latest, item) => {
    if (!item.solvedAt) return latest
    if (!latest || item.solvedAt > latest) return item.solvedAt
    return latest
  }, null)

  await setDoc(
    doc(db, 'puzzleWeekLeaderboard', `${entry.eventId}__${entry.id}`),
    {
      eventId: entry.eventId,
      entryId: entry.id,
      name: entry.name,
      type: entry.type,
      solvedCount: solvedProgress.length,
      solvedPuzzleIds: solvedProgress.map(item => item.puzzleId),
      lastSolvedAt: lastSolvedAt ?? null,
      active,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
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
  const entry = await getEntryById(eventId, membership.entryId)
  if (!entry || entry.status === 'merged') {
    return { entry: null, members: [] }
  }

  const members = await getEntryMembers(eventId, membership.entryId)
  const joinCode = entry.type === 'team' ? await getJoinCodeForEntry(eventId, membership.entryId) : null

  return {
    entry: { ...entry, joinCode },
    members,
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
    isLocked: false,
    status: 'active',
    createdAt: serverTimestamp(),
  })

  await addMembership(entryRef.id, eventId, user)
  await updateLeaderboardSnapshot(
    {
      id: entryRef.id,
      eventId,
      type: 'solo',
      name: normalizeName(user.displayName ?? user.email ?? 'Solo Player'),
      joinCode: null,
      isLocked: false,
      status: 'active',
      createdAt: null,
    },
    [],
  )
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
    isLocked: false,
    status: 'active',
    createdAt: serverTimestamp(),
  })

  await setDoc(doc(db, 'puzzleWeekJoinCodes', `${eventId}__${joinCode}`), {
    eventId,
    entryId: entryRef.id,
    joinCode,
    createdAt: serverTimestamp(),
  })

  await addMembership(entryRef.id, eventId, user)
  await updateLeaderboardSnapshot(
    {
      id: entryRef.id,
      eventId,
      type: 'team',
      name,
      joinCode,
      isLocked: false,
      status: 'active',
      createdAt: null,
    },
    [],
  )
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
  const teamMembers = await getEntryMembers(eventId, entry.id)
  if (teamMembers.length >= PUZZLE_WEEK_MAX_TEAM_SIZE) {
    throw new Error(`This team already has ${PUZZLE_WEEK_MAX_TEAM_SIZE} members.`)
  }

  if (!membershipDoc) {
    await addMembership(entry.id, eventId, user)
    const teamProgress = await getPuzzleWeekProgress(eventId, entry.id)
    await updateLeaderboardSnapshot(entry, teamProgress.filter(item => item.solved), true)
    return
  }

  const oldEntry = existing.entry
  if (oldEntry?.type === 'solo') {
    const [soloProgressMap, teamProgressMap] = await Promise.all([
      getSolvedProgressMap(eventId, oldEntry.id),
      getSolvedProgressMap(eventId, entry.id),
    ])

    for (const [puzzleId, progressItem] of soloProgressMap) {
      if (teamProgressMap.has(puzzleId)) continue
      await setDoc(
        doc(db, 'puzzleWeekProgress', `${eventId}__${entry.id}__${puzzleId}`),
        {
          eventId,
          entryId: entry.id,
          puzzleId,
          solved: true,
          solvedAt: progressItem.solvedAt ? Timestamp.fromDate(progressItem.solvedAt) : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    await updateDoc(doc(db, 'puzzleWeekEntries', oldEntry.id), {
      status: 'merged',
      mergedIntoEntryId: entry.id,
      updatedAt: serverTimestamp(),
    })
    await updateLeaderboardSnapshot({ ...oldEntry, status: 'merged' }, [], false)
    const mergedProgress = await getPuzzleWeekProgress(eventId, entry.id)
    await updateLeaderboardSnapshot(entry, mergedProgress.filter(item => item.solved), true)
  }

  await updateDoc(membershipDoc.ref, {
    entryId: entry.id,
    displayName: user.displayName ?? user.email ?? 'Participant',
    email: user.email ?? '',
    joinedAt: serverTimestamp(),
  })
}

export async function getPuzzleWeekProgress(eventId: string, entryId: string): Promise<PuzzleWeekProgress[]> {
  const progressSnap = await getDocs(
    query(
      collection(db, 'puzzleWeekProgress'),
      where('eventId', '==', eventId),
      where('entryId', '==', entryId),
    ),
  )

  return progressSnap.docs.map(docSnap => mapProgress(docSnap.data() as Record<string, unknown>, docSnap.id))
}

export interface PuzzleWeekLeaderboardEntry {
  entryId: string
  name: string
  type: PuzzleWeekEntryType
  solvedCount: number
  lastSolvedAt: Date | null
  solvedPuzzleIds: string[]
}

export async function getPuzzleWeekLeaderboard(eventId: string): Promise<PuzzleWeekLeaderboardEntry[]> {
  const leaderboardSnap = await getDocs(
    query(collection(db, 'puzzleWeekLeaderboard'), where('eventId', '==', eventId)),
  )

  const entries: PuzzleWeekLeaderboardEntry[] = leaderboardSnap.docs
    .map(docSnap => {
      const data = docSnap.data() as Record<string, unknown>
      if (data.active === false) return null
      return {
        entryId: String(data.entryId ?? docSnap.id),
        name: String(data.name ?? ''),
        type: (data.type === 'team' ? 'team' : 'solo') as PuzzleWeekEntryType,
        solvedCount: Number(data.solvedCount ?? 0),
        lastSolvedAt: data.lastSolvedAt instanceof Timestamp ? data.lastSolvedAt.toDate() : null,
        solvedPuzzleIds: Array.isArray(data.solvedPuzzleIds)
          ? data.solvedPuzzleIds.filter((value): value is string => typeof value === 'string')
          : [],
      }
    })
    .filter((value): value is PuzzleWeekLeaderboardEntry => value !== null)

  return entries.sort((a, b) => {
    if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount
    if (!a.lastSolvedAt && !b.lastSolvedAt) return 0
    if (!a.lastSolvedAt) return 1
    if (!b.lastSolvedAt) return -1
    return a.lastSolvedAt.getTime() - b.lastSolvedAt.getTime()
  })
}

export async function submitPuzzleWeekAnswer(
  eventId: string,
  user: User,
  puzzleId: string,
  rawAnswer: string,
): Promise<PuzzleWeekAnswerResult> {
  assertPuzzleWeekEligibility(user)
  const puzzle = PUZZLE_WEEK_PUZZLES.find(item => item.id === puzzleId)
  if (!puzzle) {
    throw new Error('That puzzle could not be found.')
  }

  if (puzzle.acceptedAnswers.length === 0) {
    throw new Error('Answer checking for this puzzle is not configured yet.')
  }

  const normalizedAttempt = normalizeAnswer(rawAnswer)
  if (!normalizedAttempt) {
    throw new Error('Enter an answer first.')
  }

  const registration = await getPuzzleWeekRegistration(eventId, user.uid)
  if (!registration.entry) {
    throw new Error('You need to register for Puzzle Week before submitting answers.')
  }
  const entryId = registration.entry.id

  const progressRef = doc(db, 'puzzleWeekProgress', `${eventId}__${entryId}__${puzzleId}`)
  const existing = await getDoc(progressRef)
  if (existing.exists() && existing.data().solved === true) {
    return {
      correct: true,
      message: 'Already marked correct.',
    }
  }

  const accepted = puzzle.acceptedAnswers.map(normalizeAnswer)
  const correct = accepted.includes(normalizedAttempt)

  if (!correct) {
    return {
      correct: false,
      message: 'Not quite yet. Check for typos and try again.',
    }
  }

  await setDoc(
    progressRef,
    {
      eventId,
      entryId,
      puzzleId,
      solved: true,
      solvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  const solvedProgress = await getPuzzleWeekProgress(eventId, entryId)
  await updateLeaderboardSnapshot(registration.entry, solvedProgress.filter(item => item.solved), true)

  return {
    correct: true,
    message: 'Correct!',
  }
}
