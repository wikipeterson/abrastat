'use client'

import { useEffect, useState } from 'react'
import { getLeaderboard, LeaderboardEntry, GameId } from '@/lib/leaderboard'

interface LeaderboardProps {
  gameId: GameId
  highlightInitials?: string  // highlight the row that just submitted
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({ gameId, highlightInitials }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getLeaderboard(gameId)
      .then(data => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gameId])

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
          Top Scores · Last 2 Weeks
        </span>
        {loading && <span className="text-xs text-[var(--color-muted)]">Loading…</span>}
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {!loading && entries.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-muted)]">
            No scores yet — be the first!
          </div>
        )}
        {entries.map((e, i) => {
          const isHighlighted = highlightInitials && e.initials === highlightInitials
          return (
            <div
              key={e.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${isHighlighted ? 'bg-[var(--color-accent-light)]' : ''}`}
            >
              <span className="w-6 text-center text-sm font-bold text-[var(--color-muted)]">
                {MEDALS[i] ?? `${i + 1}`}
              </span>
              <span className="text-xl w-7 text-center">{e.emoji}</span>
              <span className="flex-1 text-sm font-mono font-bold text-[var(--color-text)] tracking-widest">
                {e.initials}
              </span>
              <span className="text-sm font-semibold text-[var(--color-accent)] tabular-nums">
                {e.score}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
