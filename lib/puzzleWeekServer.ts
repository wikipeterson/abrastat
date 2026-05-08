import { createSign } from 'crypto'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  PUZZLE_WEEK_MAX_TEAM_SIZE,
  PUZZLE_WEEK_PUZZLES,
  PuzzleWeekAnswerResult,
  PuzzleWeekEntry,
  PuzzleWeekEntryType,
  PuzzleWeekLeaderboardEntry,
  PuzzleWeekMember,
  PuzzleWeekProgress,
} from './puzzleWeek'
import { canRegisterForPuzzleWeekIdentity, getPuzzleWeekEligibilityMessage } from './featureFlags'

interface VerifiedPuzzleWeekUser {
  uid: string
  email: string | null
  displayName: string | null
}

interface FirestoreDocument {
  name: string
  fields?: Record<string, FirestoreValue>
  createTime?: string
  updateTime?: string
}

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }

interface PuzzleWeekJoinCodeRecord {
  entryId: string
  eventId: string
  joinCode: string
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null

function assertServerFirebaseConfig() {
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  }
  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('Missing FIREBASE_CLIENT_EMAIL')
  }
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing FIREBASE_PRIVATE_KEY')
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY')
  }
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

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getServiceAccessToken() {
  assertServerFirebaseConfig()
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()
  const signature = signer.sign(privateKey)
  const assertion = `${header}.${payload}.${base64UrlEncode(signature)}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error('Could not obtain Firebase service access token.')
  }

  const tokenData = await tokenResponse.json() as { access_token: string; expires_in: number }
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  }
  return tokenData.access_token
}

function firestoreBaseUrl() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } }
  }
  throw new Error(`Unsupported Firestore value: ${String(value)}`)
}

function encodeFirestoreFields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]))
}

function decodeFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('timestampValue' in value) return new Date(value.timestampValue)
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(item => decodeFirestoreValue(item))
  return null
}

function decodeFirestoreDocument<T extends Record<string, unknown>>(doc: FirestoreDocument | null): T | null {
  if (!doc?.fields) return null
  return Object.fromEntries(
    Object.entries(doc.fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  ) as T
}

async function firestoreRequest<T = unknown>(path: string, init?: RequestInit) {
  const token = await getServiceAccessToken()
  const response = await fetch(`${firestoreBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Firestore request failed (${response.status})`)
  }
  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}

async function getDocument<T extends Record<string, unknown>>(collectionName: string, docId: string) {
  try {
    const doc = await firestoreRequest<FirestoreDocument>(`/${collectionName}/${docId}`)
    return decodeFirestoreDocument<T>(doc)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) return null
    throw error
  }
}

async function setDocument(collectionName: string, docId: string, data: Record<string, unknown>) {
  await firestoreRequest(`/${collectionName}/${docId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFirestoreFields(data) }),
  })
}

async function updateDocument(collectionName: string, docId: string, data: Record<string, unknown>) {
  const params = new URLSearchParams()
  Object.keys(data).forEach(key => params.append('updateMask.fieldPaths', key))
  await firestoreRequest(`/${collectionName}/${docId}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFirestoreFields(data) }),
  })
}

async function queryCollection<T extends Record<string, unknown>>(
  collectionName: string,
  filters: Array<{ field: string; op?: 'EQUAL'; value: unknown }>,
  limitCount?: number,
) {
  const filterNodes = filters.map(filter => ({
    fieldFilter: {
      field: { fieldPath: filter.field },
      op: filter.op ?? 'EQUAL',
      value: encodeFirestoreValue(filter.value),
    },
  }))

  const body: Record<string, unknown> = {
    structuredQuery: {
      from: [{ collectionId: collectionName }],
      where: filterNodes.length === 1
        ? filterNodes[0]
        : { compositeFilter: { op: 'AND', filters: filterNodes } },
    },
  }
  if (limitCount) {
    ;(body.structuredQuery as Record<string, unknown>).limit = limitCount
  }

  const rows = await firestoreRequest<Array<{ document?: FirestoreDocument }>>(':runQuery', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return rows
    .map(row => {
      if (!row.document) return null
      const data = decodeFirestoreDocument<T>(row.document)
      if (!data) return null
      const id = row.document.name.split('/').pop() || ''
      return { id, data }
    })
    .filter((row): row is { id: string; data: T } => row !== null)
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
    createdAt: data.createdAt instanceof Date ? data.createdAt : null,
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
    joinedAt: data.joinedAt instanceof Date ? data.joinedAt : null,
  }
}

function mapProgress(data: Record<string, unknown>, id: string): PuzzleWeekProgress {
  return {
    puzzleId: typeof data.puzzleId === 'string' ? data.puzzleId : id,
    entryId: String(data.entryId ?? ''),
    eventId: String(data.eventId ?? ''),
    solved: Boolean(data.solved),
    solvedAt: data.solvedAt instanceof Date ? data.solvedAt : null,
  }
}

function mapJoinCodeRecord(data: Record<string, unknown>): PuzzleWeekJoinCodeRecord {
  return {
    entryId: String(data.entryId ?? ''),
    eventId: String(data.eventId ?? ''),
    joinCode: String(data.joinCode ?? ''),
  }
}

async function verifyPuzzleWeekUser(idToken: string | null | undefined): Promise<VerifiedPuzzleWeekUser> {
  assertServerFirebaseConfig()
  if (!idToken) {
    throw new Error('Missing authentication token.')
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  )

  if (!response.ok) {
    throw new Error('Could not verify your sign-in.')
  }

  const payload = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string }> }
  const user = payload.users?.[0]
  if (!user?.localId) {
    throw new Error('Could not verify your sign-in.')
  }

  const verifiedUser: VerifiedPuzzleWeekUser = {
    uid: user.localId,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  }

  if (!canRegisterForPuzzleWeekIdentity(verifiedUser)) {
    throw new Error(getPuzzleWeekEligibilityMessage())
  }

  return verifiedUser
}

async function getExistingJoinCodeEntry(eventId: string, joinCode: string) {
  const joinCodeDoc = await getDocument<Record<string, unknown>>('puzzleWeekJoinCodes', `${eventId}__${joinCode}`)
  if (joinCodeDoc) {
    const joinCodeRecord = mapJoinCodeRecord(joinCodeDoc)
    const entry = await getEntryById(eventId, joinCodeRecord.entryId)
    if (entry) return entry
  }

  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekEntries', [
    { field: 'eventId', value: eventId },
    { field: 'joinCode', value: joinCode },
  ], 1)
  const row = rows[0]
  return row ? mapEntry(row.data, row.id) : null
}

async function generateUniqueJoinCode(eventId: string): Promise<string> {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let joinCode = ''
    for (let i = 0; i < 6; i += 1) {
      joinCode += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    const existing = await getExistingJoinCodeEntry(eventId, joinCode)
    if (!existing) return joinCode
  }
  throw new Error('Could not generate a unique team code. Please try again.')
}

async function getEntryById(eventId: string, entryId: string): Promise<PuzzleWeekEntry | null> {
  const data = await getDocument<Record<string, unknown>>('puzzleWeekEntries', entryId)
  if (!data) return null
  const entry = mapEntry(data, entryId)
  if (entry.eventId !== eventId) return null
  return entry
}

async function getJoinCodeForEntry(eventId: string, entryId: string): Promise<string | null> {
  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekJoinCodes', [
    { field: 'eventId', value: eventId },
    { field: 'entryId', value: entryId },
  ], 1)
  if (rows[0]) {
    return mapJoinCodeRecord(rows[0].data).joinCode || null
  }
  const legacyEntry = await getEntryById(eventId, entryId)
  return legacyEntry?.joinCode ?? null
}

async function getEntryMembers(eventId: string, entryId: string) {
  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekEntryMembers', [
    { field: 'eventId', value: eventId },
    { field: 'entryId', value: entryId },
  ])
  return rows.map(row => mapMember(row.data, row.id))
}

async function getExistingMembership(eventId: string, userId: string) {
  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekEntryMembers', [
    { field: 'eventId', value: eventId },
    { field: 'userId', value: userId },
  ], 1)
  const row = rows[0]
  return row ? { id: row.id, member: mapMember(row.data, row.id) } : null
}

async function addMembership(entryId: string, eventId: string, user: VerifiedPuzzleWeekUser) {
  const membershipId = crypto.randomUUID()
  await setDocument('puzzleWeekEntryMembers', membershipId, {
    eventId,
    entryId,
    userId: user.uid,
    displayName: user.displayName ?? user.email ?? 'Participant',
    email: user.email ?? '',
    joinedAt: new Date(),
  })
}

async function getSolvedProgress(eventId: string, entryId: string) {
  const progress = await getPuzzleWeekProgressServer(eventId, entryId)
  return progress.filter(item => item.solved)
}

async function updateLeaderboardSnapshot(entry: PuzzleWeekEntry, solvedProgress: PuzzleWeekProgress[], active = true) {
  const lastSolvedAt = solvedProgress.reduce<Date | null>((latest, item) => {
    if (!item.solvedAt) return latest
    if (!latest || item.solvedAt > latest) return item.solvedAt
    return latest
  }, null)

  await setDocument('puzzleWeekLeaderboard', `${entry.eventId}__${entry.id}`, {
    eventId: entry.eventId,
    entryId: entry.id,
    name: entry.name,
    type: entry.type,
    solvedCount: solvedProgress.length,
    solvedPuzzleIds: solvedProgress.map(item => item.puzzleId),
    lastSolvedAt,
    active,
    updatedAt: new Date(),
  })
}

export async function getPuzzleWeekRegistrationServer(eventId: string, user: VerifiedPuzzleWeekUser) {
  const membershipRecord = await getExistingMembership(eventId, user.uid)
  if (!membershipRecord) {
    return { entry: null, members: [] as PuzzleWeekMember[] }
  }

  const entry = await getEntryById(eventId, membershipRecord.member.entryId)
  if (!entry || entry.status === 'merged') {
    return { entry: null, members: [] as PuzzleWeekMember[] }
  }

  const members = await getEntryMembers(eventId, membershipRecord.member.entryId)
  const joinCode = entry.type === 'team' ? await getJoinCodeForEntry(eventId, membershipRecord.member.entryId) : null
  return {
    entry: { ...entry, joinCode },
    members,
  }
}

export async function registerPuzzleWeekSoloServer(eventId: string, user: VerifiedPuzzleWeekUser) {
  const existing = await getPuzzleWeekRegistrationServer(eventId, user)
  if (existing.entry) {
    throw new Error('You are already registered for this Puzzle Week.')
  }

  const entryId = crypto.randomUUID()
  const name = normalizeName(user.displayName ?? user.email ?? 'Solo Player')
  await setDocument('puzzleWeekEntries', entryId, {
    eventId,
    type: 'solo',
    name,
    isLocked: false,
    status: 'active',
    createdAt: new Date(),
  })
  await addMembership(entryId, eventId, user)
  await updateLeaderboardSnapshot({
    id: entryId,
    eventId,
    type: 'solo',
    name,
    joinCode: null,
    isLocked: false,
    status: 'active',
    createdAt: null,
  }, [])
}

export async function registerPuzzleWeekTeamServer(eventId: string, user: VerifiedPuzzleWeekUser, teamName: string) {
  const name = normalizeName(teamName)
  if (!name) throw new Error('Enter a team name.')

  const existing = await getPuzzleWeekRegistrationServer(eventId, user)
  if (existing.entry) {
    throw new Error('You are already registered for this Puzzle Week.')
  }

  const entryId = crypto.randomUUID()
  const joinCode = await generateUniqueJoinCode(eventId)
  await setDocument('puzzleWeekEntries', entryId, {
    eventId,
    type: 'team',
    name,
    isLocked: false,
    status: 'active',
    createdAt: new Date(),
  })
  await setDocument('puzzleWeekJoinCodes', `${eventId}__${joinCode}`, {
    eventId,
    entryId,
    joinCode,
    createdAt: new Date(),
  })
  await addMembership(entryId, eventId, user)
  await updateLeaderboardSnapshot({
    id: entryId,
    eventId,
    type: 'team',
    name,
    joinCode,
    isLocked: false,
    status: 'active',
    createdAt: null,
  }, [])
}

export async function joinPuzzleWeekTeamServer(eventId: string, user: VerifiedPuzzleWeekUser, rawJoinCode: string) {
  const joinCode = rawJoinCode.trim().toUpperCase()
  if (!joinCode) throw new Error('Enter a join code.')

  const membershipRecord = await getExistingMembership(eventId, user.uid)
  const existing = membershipRecord ? await getPuzzleWeekRegistrationServer(eventId, user) : { entry: null, members: [] as PuzzleWeekMember[] }
  if (existing.entry?.type === 'team') {
    throw new Error('You are already registered on a team for this Puzzle Week.')
  }

  const teamEntry = await getExistingJoinCodeEntry(eventId, joinCode)
  if (!teamEntry || teamEntry.type !== 'team') {
    throw new Error('We could not find that team code.')
  }
  if (teamEntry.isLocked) {
    throw new Error('This team is locked and can’t accept new members.')
  }

  const teamMembers = await getEntryMembers(eventId, teamEntry.id)
  if (teamMembers.length >= PUZZLE_WEEK_MAX_TEAM_SIZE) {
    throw new Error(`This team already has ${PUZZLE_WEEK_MAX_TEAM_SIZE} members.`)
  }

  if (!membershipRecord) {
    await addMembership(teamEntry.id, eventId, user)
    const teamProgress = await getSolvedProgress(eventId, teamEntry.id)
    await updateLeaderboardSnapshot(teamEntry, teamProgress, true)
    return
  }

  const oldEntry = existing.entry
  if (oldEntry?.type === 'solo') {
    const [soloProgress, teamProgress] = await Promise.all([
      getSolvedProgress(eventId, oldEntry.id),
      getSolvedProgress(eventId, teamEntry.id),
    ])

    for (const progressItem of soloProgress) {
      if (teamProgress.some(item => item.puzzleId === progressItem.puzzleId)) continue
      await setDocument('puzzleWeekProgress', `${eventId}__${teamEntry.id}__${progressItem.puzzleId}`, {
        eventId,
        entryId: teamEntry.id,
        puzzleId: progressItem.puzzleId,
        solved: true,
        solvedAt: progressItem.solvedAt ?? new Date(),
        updatedAt: new Date(),
      })
    }

    await updateDocument('puzzleWeekEntries', oldEntry.id, {
      status: 'merged',
      mergedIntoEntryId: teamEntry.id,
      updatedAt: new Date(),
    })
    await updateLeaderboardSnapshot({ ...oldEntry, status: 'merged' }, [], false)
  }

  await updateDocument('puzzleWeekEntryMembers', membershipRecord.id, {
    entryId: teamEntry.id,
    displayName: user.displayName ?? user.email ?? 'Participant',
    email: user.email ?? '',
    joinedAt: new Date(),
  })

  const mergedProgress = await getSolvedProgress(eventId, teamEntry.id)
  await updateLeaderboardSnapshot(teamEntry, mergedProgress, true)
}

export async function getPuzzleWeekProgressServer(eventId: string, entryId: string) {
  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekProgress', [
    { field: 'eventId', value: eventId },
    { field: 'entryId', value: entryId },
  ])
  return rows.map(row => mapProgress(row.data, row.id))
}

export async function getPuzzleWeekLeaderboardServer(eventId: string): Promise<PuzzleWeekLeaderboardEntry[]> {
  const rows = await queryCollection<Record<string, unknown>>('puzzleWeekLeaderboard', [
    { field: 'eventId', value: eventId },
  ])
  const snapshotByEntryId = new Map<string, Record<string, unknown>>(
    rows
      .map(row => [String(row.data.entryId ?? row.id), row.data] as const)
  )

  const entryRows = await queryCollection<Record<string, unknown>>('puzzleWeekEntries', [
    { field: 'eventId', value: eventId },
  ])
  const activeEntries = entryRows
    .map(row => mapEntry(row.data, row.id))
    .filter(entry => entry.status !== 'merged')

  for (const entry of activeEntries) {
    if (snapshotByEntryId.has(entry.id)) continue
    const solvedProgress = await getSolvedProgress(eventId, entry.id)
    await updateLeaderboardSnapshot(entry, solvedProgress, true)
    snapshotByEntryId.set(entry.id, {
      entryId: entry.id,
      name: entry.name,
      type: entry.type,
      solvedCount: solvedProgress.length,
      solvedPuzzleIds: solvedProgress.map(item => item.puzzleId),
      lastSolvedAt: solvedProgress.reduce<Date | null>((latest, item) => {
        if (!item.solvedAt) return latest
        if (!latest || item.solvedAt > latest) return item.solvedAt
        return latest
      }, null),
      active: true,
    })
  }

  const entries = Array.from(snapshotByEntryId.values())
    .map(row => {
      const data = row
      if (data.active === false) return null
      return {
        entryId: String(data.entryId ?? ''),
        name: String(data.name ?? ''),
        type: (data.type === 'team' ? 'team' : 'solo') as PuzzleWeekEntryType,
        solvedCount: Number(data.solvedCount ?? 0),
        lastSolvedAt: data.lastSolvedAt instanceof Date ? data.lastSolvedAt : null,
        solvedPuzzleIds: Array.isArray(data.solvedPuzzleIds)
          ? data.solvedPuzzleIds.filter((value): value is string => typeof value === 'string')
          : [],
      }
    })
    .filter((item): item is PuzzleWeekLeaderboardEntry => item !== null)

  return entries.sort((a, b) => {
    if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount
    if (!a.lastSolvedAt && !b.lastSolvedAt) return 0
    if (!a.lastSolvedAt) return 1
    if (!b.lastSolvedAt) return -1
    return a.lastSolvedAt.getTime() - b.lastSolvedAt.getTime()
  })
}

export async function submitPuzzleWeekAnswerServer(
  eventId: string,
  user: VerifiedPuzzleWeekUser,
  puzzleId: string,
  rawAnswer: string,
): Promise<PuzzleWeekAnswerResult> {
  const puzzle = PUZZLE_WEEK_PUZZLES.find(item => item.id === puzzleId)
  if (!puzzle) {
    throw new Error('That puzzle could not be found.')
  }
  const normalizedAttempt = normalizeAnswer(rawAnswer)
  if (!normalizedAttempt) {
    throw new Error('Enter an answer first.')
  }

  const registration = await getPuzzleWeekRegistrationServer(eventId, user)
  if (!registration.entry) {
    throw new Error('You need to register for Puzzle Week before submitting answers.')
  }
  const entryId = registration.entry.id
  const progressId = `${eventId}__${entryId}__${puzzleId}`
  const existing = await getDocument<Record<string, unknown>>('puzzleWeekProgress', progressId)
  if (existing?.solved === true) {
    return { correct: true, message: 'Already marked correct.' }
  }

  const correct = puzzle.acceptedAnswers.map(normalizeAnswer).includes(normalizedAttempt)
  if (!correct) {
    return { correct: false, message: 'Not quite yet. Check for typos and try again.' }
  }

  await setDocument('puzzleWeekProgress', progressId, {
    eventId,
    entryId,
    puzzleId,
    solved: true,
    solvedAt: new Date(),
    updatedAt: new Date(),
  })

  const solvedProgress = await getSolvedProgress(eventId, entryId)
  await updateLeaderboardSnapshot(registration.entry, solvedProgress, true)

  return { correct: true, message: 'Correct!' }
}

export async function verifyPuzzleWeekRequest(authHeader: string | null) {
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const user = await verifyPuzzleWeekUser(idToken)
  if (CURRENT_PUZZLE_WEEK_EVENT.id !== 'puzzle-week-2026') {
    throw new Error('Puzzle Week event is not configured.')
  }
  return user
}
