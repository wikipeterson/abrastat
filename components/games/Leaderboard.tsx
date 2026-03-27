'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { getLeaderboard, submitScore, LeaderboardEntry, GameId } from '@/lib/leaderboard'
import { useStore } from '@/lib/store'

interface LeaderboardProps {
  gameId: GameId
  pendingScore?: number | null   // non-null when a game just ended
  onSubmitted?: () => void
}

export function Leaderboard({ gameId, pendingScore, onSubmitted }: LeaderboardProps) {
  const { user } = useStore()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setLoading(true)
    setSubmitted(false)
    getLeaderboard(gameId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [gameId])

  async function handleSubmit() {
    if (!user || pendingScore == null) return
    setSubmitting(true)
    try {
      await submitScore(
        gameId,
        user.uid,
        user.displayName ?? 'Anonymous',
        user.photoURL ?? null,
        pendingScore
      )
      const updated = await getLeaderboard(gameId)
      setEntries(updated)
      setSubmitted(true)
      onSubmitted?.()
    } catch {
      // silently ignore submission errors
    } finally {
      setSubmitting(false)
    }
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
          Top Scores · Last 2 Weeks
        </span>
        {loading && <span className="text-xs text-[var(--color-muted)]">Loading…</span>}
      </div>

      {pendingScore != null && !submitted && user && (
        <div className="px-4 py-3 bg-[var(--color-accent-light)] border-b border-[var(--color-border)] flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-text)]">
            Your score: <strong>{pendingScore}</strong>
          </span>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? 'Submitting…' : 'Submit to Leaderboard'}
          </button>
        </div>
      )}

      {submitted && (
        <div className="px-4 py-3 bg-green-50 border-b border-green-100 text-sm text-green-700">
          ✓ Score submitted!
        </div>
      )}

      {pendingScore != null && !user && (
        <div className="px-4 py-2 bg-slate-50 border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
          Sign in to submit your score.
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)]">
        {!loading && entries.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-muted)]">
            No scores yet — be the first!
          </div>
        )}
        {entries.map((e, i) => (
          <div key={e.id} className={`flex items-center gap-3 px-4 py-2.5 ${e.userId === user?.uid ? 'bg-[var(--color-accent-light)]' : ''}`}>
            <span className="w-6 text-center text-sm font-bold text-[var(--color-muted)]">
              {medals[i] ?? `${i + 1}`}
            </span>
            {e.photoURL ? (
              <Image src={e.photoURL} alt="" width={24} height={24} className="rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-200 flex-shrink-0" />
            )}
            <span className="flex-1 text-sm text-[var(--color-text)] truncate">{e.displayName}</span>
            <span className="text-sm font-semibold text-[var(--color-accent)] tabular-nums">{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
