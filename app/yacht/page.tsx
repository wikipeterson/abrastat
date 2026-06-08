'use client'

import { useState } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Header } from '@/components/layout/Header'
import { Yacht, YACHT_MAX_SCORE } from '@/components/games/Yacht'
import { ScoreEntry } from '@/components/games/ScoreEntry'
import { Leaderboard } from '@/components/games/Leaderboard'
import { GAME_IDS, submitScore } from '@/lib/leaderboard'
import { useStore } from '@/lib/store'

type YachtPageState =
  | { view: 'playing' }
  | { view: 'done'; score: number; submittedInitials: string | null }

function YachtPageContent() {
  const { user } = useStore()
  const [state, setState] = useState<YachtPageState>({ view: 'playing' })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(initials: string, emoji: string) {
    if (state.view !== 'done') return
    setSubmitting(true)
    try {
      await submitScore(
        GAME_IDS.yacht,
        user?.uid ?? 'guest',
        initials,
        emoji,
        state.score,
      )
      setState({ ...state, submittedInitials: initials })
    } catch {
      setState({ ...state, submittedInitials: initials })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header centerTitle="Yacht" showSave={false} />

      <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        {state.view === 'playing' ? (
          <div className="w-full max-w-[98vw] 2xl:max-w-[1880px] mx-auto py-6 px-3 space-y-4">
            <div className="w-full bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4">
              <Yacht onDone={score => setState({ view: 'done', score, submittedInitials: null })} />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[98vw] 2xl:max-w-[1880px] mx-auto py-6 px-3 space-y-4">
            <div className="w-full bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5">
              {state.submittedInitials === null ? (
                <ScoreEntry
                  score={state.score}
                  maxScore={YACHT_MAX_SCORE}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                />
              ) : (
                <div className="text-center space-y-1 py-2">
                  <div className="text-[var(--color-accent-strong)] font-semibold">✓ Score submitted!</div>
                  <div className="text-4xl font-bold text-[var(--color-accent)] tabular-nums">
                    {state.score} <span className="text-lg font-normal text-[var(--color-muted)]">/ {YACHT_MAX_SCORE}</span>
                  </div>
                </div>
              )}
            </div>

            {state.submittedInitials !== null && (
              <Leaderboard gameId={GAME_IDS.yacht} highlightInitials={state.submittedInitials} />
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setState({ view: 'playing' })}
                className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium hover:border-[var(--color-accent)] transition-colors"
              >
                Play Again
              </button>
              <a
                href="/workspace?mode=library&section=games"
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity text-center"
              >
                All Games
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function YachtPage() {
  return (
    <ProtectedRoute>
      <YachtPageContent />
    </ProtectedRoute>
  )
}
