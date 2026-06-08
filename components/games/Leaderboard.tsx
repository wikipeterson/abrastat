'use client'

import { useEffect, useMemo, useState } from 'react'
import { getLeaderboard, LeaderboardEntry, GameId } from '@/lib/leaderboard'

interface LeaderboardProps {
  gameId: GameId
  highlightInitials?: string
  compact?: boolean  // hide the title bar when embedded in a card
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({ gameId, highlightInitials, compact }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getLeaderboard(gameId)
      .then(data => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gameId])

  const highlightedIndex = useMemo(
    () => (highlightInitials ? entries.findIndex(e => e.initials === highlightInitials) : -1),
    [entries, highlightInitials]
  )

  const shouldAutoExpandForHighlight = highlightedIndex >= 3
  const visibleEntries = (expanded || shouldAutoExpandForHighlight) ? entries : entries.slice(0, 3)
  const canExpand = entries.length > 3

  return (
    <div className={compact ? '' : 'bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden'}>
      {!compact && (
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <span className="text-sm font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide">
            Top Scores · Last 2 Weeks
          </span>
          {loading && <span className="text-xs text-[var(--color-muted)]">Loading…</span>}
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)]">
        {loading && compact && (
          <div className="px-4 py-4 text-xs text-center text-[var(--color-muted)]">Loading…</div>
        )}
        {!loading && entries.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-muted)]">
            No scores yet — be the first!
          </div>
        )}
        {visibleEntries.map((e, i) => {
          const absoluteIndex = expanded || shouldAutoExpandForHighlight ? i : i
          const isHighlighted = highlightInitials && e.initials === highlightInitials
          return (
            <div
              key={e.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${isHighlighted ? 'bg-[var(--color-accent-light)]' : ''}`}
            >
              <span className="w-6 text-center text-sm font-bold text-[var(--color-muted)]">
                {MEDALS[absoluteIndex] ?? `${absoluteIndex + 1}`}
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

      {!loading && canExpand && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/60">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-sm font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity"
          >
            {expanded || shouldAutoExpandForHighlight ? 'Show fewer' : `More (${entries.length - 3} more)`}
          </button>
        </div>
      )}
    </div>
  )
}
