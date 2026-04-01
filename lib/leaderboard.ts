import { db } from './firebase'
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore'

export const GAME_IDS = {
  guessCorrelation: 'guess-correlation',
  moreVariability: 'more-variability',
  realOrRandom: 'real-or-random',
  guessResidual: 'guess-residual',
  meanVsMedian: 'mean-vs-median',
  yacht: 'yacht',
} as const

export type GameId = (typeof GAME_IDS)[keyof typeof GAME_IDS]

export interface LeaderboardEntry {
  id: string
  userId: string
  initials: string
  emoji: string
  score: number
  createdAt: Date
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

export async function submitScore(
  gameId: GameId,
  userId: string,
  initials: string,
  emoji: string,
  score: number
): Promise<void> {
  await addDoc(collection(db, 'leaderboards', gameId, 'scores'), {
    userId,
    initials,
    emoji,
    score,
    createdAt: Timestamp.now(),
  })
}

export async function getLeaderboard(gameId: GameId): Promise<LeaderboardEntry[]> {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - TWO_WEEKS_MS))
  const q = query(
    collection(db, 'leaderboards', gameId, 'scores'),
    where('createdAt', '>=', cutoff),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  const entries: LeaderboardEntry[] = snap.docs.map(d => ({
    id: d.id,
    userId: d.data().userId as string,
    initials: d.data().initials as string,
    emoji: d.data().emoji as string,
    score: d.data().score as number,
    createdAt: (d.data().createdAt as Timestamp).toDate(),
  }))
  return entries.sort((a, b) => b.score - a.score).slice(0, 10)
}
