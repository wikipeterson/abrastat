import type { User } from 'firebase/auth'

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
  { id: 'puzzle-2', title: 'Day 2: It’s-a-me and My Friends', acceptedAnswers: ['MIYAMOTO'] },
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

export interface PuzzleWeekAnswerResult {
  correct: boolean
  message: string
}

export interface PuzzleWeekLeaderboardEntry {
  entryId: string
  name: string
  type: PuzzleWeekEntryType
  memberNames: string[]
  solvedCount: number
  lastSolvedAt: Date | null
  solvedPuzzleIds: string[]
}

export interface PuzzleWeekVote {
  easiest: string | null
  hardest: string | null
  favorite: string | null
}

export interface PuzzleWeekVoteTally {
  easiest: Record<string, number>
  hardest: Record<string, number>
  favorite: Record<string, number>
  totalVoters: number
}

export type PuzzleWeekBonusTier = 'easy' | 'medium' | 'hard'
export type PuzzleWeek2048MedalLevel = 'bronze' | 'silver' | 'gold'
export const PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION = 3

export interface PuzzleWeekQueensSolvedBoards {
  easy: number[]
  medium: number[]
  hard: number[]
}

export interface PuzzleWeekBonusMedals {
  slider: PuzzleWeekBonusTier[]
  lightsOut: PuzzleWeekBonusTier[]
  netwalk: PuzzleWeekBonusTier[]
  game2048: PuzzleWeek2048MedalLevel[]
  queens: PuzzleWeekBonusTier[]
  queensSolved: PuzzleWeekQueensSolvedBoards
  queensSolvedOrderVersion: number
}

export interface PuzzleWeekAdminEntry {
  entry: PuzzleWeekEntry
  members: PuzzleWeekMember[]
  solvedCount: number
  solvedPuzzleIds: string[]
  lastSolvedAt: Date | null
}

async function puzzleWeekRequest<T>(user: User, init: RequestInit & { url: string }): Promise<T> {
  const token = await user.getIdToken()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  let response: Response
  try {
    response = await fetch(init.url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Puzzle Week is taking too long to respond. Please try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Puzzle Week request failed.')
  }
  return data as T
}

async function puzzleWeekPublicRequest<T>(init: RequestInit & { url: string }): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  let response: Response
  try {
    response = await fetch(init.url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Puzzle Week is taking too long to respond. Please try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Puzzle Week request failed.')
  }
  return data as T
}

function reviveDate(value: unknown) {
  return typeof value === 'string' ? new Date(value) : null
}

function mapEntry(entry: PuzzleWeekEntry | null): PuzzleWeekEntry | null {
  if (!entry) return null
  return {
    ...entry,
    createdAt: reviveDate(entry.createdAt),
  }
}

function mapMembers(members: PuzzleWeekMember[]) {
  return members.map(member => ({
    ...member,
    joinedAt: reviveDate(member.joinedAt),
  }))
}

function mapProgress(progress: PuzzleWeekProgress[]) {
  return progress.map(item => ({
    ...item,
    solvedAt: reviveDate(item.solvedAt),
  }))
}

function mapLeaderboard(entries: PuzzleWeekLeaderboardEntry[]) {
  return entries.map(entry => ({
    ...entry,
    memberNames: Array.isArray(entry.memberNames) ? entry.memberNames : [],
    solvedPuzzleIds: Array.isArray(entry.solvedPuzzleIds) ? entry.solvedPuzzleIds : [],
    lastSolvedAt: reviveDate(entry.lastSolvedAt),
  }))
}

function mapAdminEntries(entries: PuzzleWeekAdminEntry[]) {
  return entries.map(item => ({
    ...item,
    entry: mapEntry(item.entry)!,
    members: mapMembers(item.members),
    lastSolvedAt: reviveDate(item.lastSolvedAt),
  }))
}

export async function getPuzzleWeekRegistration(eventId: string, user: User): Promise<{
  entry: PuzzleWeekEntry | null
  members: PuzzleWeekMember[]
}> {
  const data = await puzzleWeekRequest<{ entry: PuzzleWeekEntry | null; members: PuzzleWeekMember[] }>(user, {
    url: `/api/puzzle-week?action=registration&eventId=${encodeURIComponent(eventId)}`,
    method: 'GET',
  })
  return {
    entry: mapEntry(data.entry),
    members: mapMembers(data.members),
  }
}

export async function registerPuzzleWeekSolo(eventId: string, user: User) {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'registerSolo', eventId }),
  })
}

export async function registerPuzzleWeekTeam(eventId: string, user: User, teamName: string) {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'registerTeam', eventId, teamName }),
  })
}

export async function joinPuzzleWeekTeam(eventId: string, user: User, rawJoinCode: string) {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'joinTeam', eventId, joinCode: rawJoinCode }),
  })
}

export async function resetPuzzleWeekRegistration(eventId: string, user: User) {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'resetRegistration', eventId }),
  })
}

export async function getPuzzleWeekProgress(eventId: string, user: User): Promise<PuzzleWeekProgress[]> {
  const data = await puzzleWeekRequest<PuzzleWeekProgress[]>(user, {
    url: `/api/puzzle-week?action=progress&eventId=${encodeURIComponent(eventId)}`,
    method: 'GET',
  })
  return mapProgress(data)
}

export async function getPuzzleWeekLeaderboard(eventId: string, user?: User | null): Promise<PuzzleWeekLeaderboardEntry[]> {
  const requester = user
    ? puzzleWeekRequest<PuzzleWeekLeaderboardEntry[]>(user, {
        url: `/api/puzzle-week?action=leaderboard&eventId=${encodeURIComponent(eventId)}`,
        method: 'GET',
      })
    : puzzleWeekPublicRequest<PuzzleWeekLeaderboardEntry[]>({
        url: `/api/puzzle-week?action=leaderboard&eventId=${encodeURIComponent(eventId)}`,
        method: 'GET',
      })
  return mapLeaderboard(await requester)
}

export async function submitPuzzleWeekAnswer(
  eventId: string,
  user: User,
  puzzleId: string,
  rawAnswer: string,
): Promise<PuzzleWeekAnswerResult> {
  return puzzleWeekRequest<PuzzleWeekAnswerResult>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({
      action: 'submitAnswer',
      eventId,
      puzzleId,
      answer: rawAnswer,
    }),
  })
}

function getDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return 'PuzzleWeek2026.pdf'
  const match = contentDisposition.match(/filename="?([^"]+)"?/)
  return match?.[1] ?? 'PuzzleWeek2026.pdf'
}

export async function downloadPuzzleWeekPacket(user: User) {
  const token = await user.getIdToken()
  const response = await fetch('/api/puzzle-week/packet', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not download the puzzle pack.')
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = getDownloadFilename(response.headers.get('content-disposition'))
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function getPuzzleWeekVoteData(
  eventId: string,
  user?: User | null,
): Promise<{ tally: PuzzleWeekVoteTally; myVote: PuzzleWeekVote | null }> {
  const url = `/api/puzzle-week?action=voteData&eventId=${encodeURIComponent(eventId)}`
  return user
    ? puzzleWeekRequest<{ tally: PuzzleWeekVoteTally; myVote: PuzzleWeekVote | null }>(user, { url, method: 'GET' })
    : puzzleWeekPublicRequest<{ tally: PuzzleWeekVoteTally; myVote: PuzzleWeekVote | null }>({ url, method: 'GET' })
}

export async function submitPuzzleWeekVote(eventId: string, user: User, vote: PuzzleWeekVote): Promise<void> {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'submitVote', eventId, ...vote }),
  })
}

export async function getPuzzleWeekBonusMedals(eventId: string, user: User): Promise<PuzzleWeekBonusMedals> {
  return puzzleWeekRequest<PuzzleWeekBonusMedals>(user, {
    url: `/api/puzzle-week?action=bonusMedals&eventId=${encodeURIComponent(eventId)}`,
    method: 'GET',
  })
}

export async function savePuzzleWeekBonusMedals(eventId: string, user: User, medals: PuzzleWeekBonusMedals): Promise<void> {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'saveBonusMedals', eventId, medals }),
  })
}

export async function getPuzzleWeekAdminEntries(eventId: string, user: User): Promise<PuzzleWeekAdminEntry[]> {
  const data = await puzzleWeekRequest<PuzzleWeekAdminEntry[]>(user, {
    url: `/api/puzzle-week?action=adminEntries&eventId=${encodeURIComponent(eventId)}`,
    method: 'GET',
  })
  return mapAdminEntries(data)
}

export async function adminRenamePuzzleWeekEntry(eventId: string, user: User, entryId: string, name: string): Promise<void> {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'adminRenameEntry', eventId, entryId, name }),
  })
}

export async function adminResetPuzzleWeekEntry(eventId: string, user: User, entryId: string): Promise<void> {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'adminResetEntry', eventId, entryId }),
  })
}

export async function adminRemovePuzzleWeekMember(eventId: string, user: User, memberId: string): Promise<void> {
  await puzzleWeekRequest<{ ok: true }>(user, {
    url: '/api/puzzle-week',
    method: 'POST',
    body: JSON.stringify({ action: 'adminRemoveMember', eventId, memberId }),
  })
}
