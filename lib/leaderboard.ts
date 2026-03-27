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
} as const

export type GameId = (typeof GAME_IDS)[keyof typeof GAME_IDS]

export interface LeaderboardEntry {
  id: string
  userId: string
  displayName: string
  photoURL: string | null
  score: number
  createdAt: Date
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

export async function submitScore(
  gameId: GameId,
  userId: string,
  displayName: string,
  photoURL: string | null,
  score: number
): Promise<void> {
  await addDoc(collection(db, 'leaderboards', gameId, 'scores'), {
    userId,
    displayName,
    photoURL: photoURL ?? null,
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
    displayName: d.data().displayName as string,
    photoURL: d.data().photoURL as string | null,
    score: d.data().score as number,
    createdAt: (d.data().createdAt as Timestamp).toDate(),
  }))
  return entries.sort((a, b) => b.score - a.score).slice(0, 10)
}
