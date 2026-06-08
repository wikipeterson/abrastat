'use client'

import { useEffect, useState } from 'react'
import { GAME_IDS, GameId, submitScore } from '@/lib/leaderboard'
import { ROUNDS_PER_GAME } from '@/lib/gameData'
import { useStore } from '@/lib/store'
import { ScoreEntry } from './ScoreEntry'
import { Leaderboard } from './Leaderboard'
import { GuessCorrelation } from './GuessCorrelation'
import { MoreVariability } from './MoreVariability'
import { GuessResidual } from './GuessResidual'
import { MeanVsMedian } from './MeanVsMedian'
import { Yacht, YACHT_MAX_SCORE } from './Yacht'

const GAMES: {
  id: GameId
  icon: string
  title: string
  description: string
  maxScore: number
  wide?: boolean
}[] = [
  {
    id: GAME_IDS.guessCorrelation,
    icon: '📈',
    title: 'Guess the Correlation',
    description: `Look at a scatter plot and estimate r. ${ROUNDS_PER_GAME} rounds — closer = more points.`,
    maxScore: ROUNDS_PER_GAME * 100,
  },
  {
    id: GAME_IDS.moreVariability,
    icon: '📊',
    title: 'Which Has More Variability?',
    description: `Two distributions side by side. Pick the one with greater spread. ${ROUNDS_PER_GAME} rounds.`,
    maxScore: ROUNDS_PER_GAME * 100,
  },
  {
    id: GAME_IDS.guessResidual,
    icon: '〰️',
    title: 'Guess the Residual Plot',
    description: `See a scatter plot with a regression line. Pick the correct residual plot from 4 options.`,
    maxScore: ROUNDS_PER_GAME * 100,
  },
  {
    id: GAME_IDS.meanVsMedian,
    icon: '⚖️',
    title: 'Compare Mean and Median',
    description: `Look at a histogram. Is the mean greater than or less than the median?`,
    maxScore: ROUNDS_PER_GAME * 100,
  },
  {
    id: GAME_IDS.yacht,
    icon: '⚄',
    title: 'Yacht',
    description: '12 rounds, 5 dice, up to 3 rolls per round. Score in Yacht categories for the highest total.',
    maxScore: YACHT_MAX_SCORE,
    wide: true,
  },
]

type State =
  | { view: 'hub' }
  | { view: 'playing'; gameId: GameId }
  | { view: 'done'; gameId: GameId; score: number; submittedInitials: string | null }

interface GameHubProps {
  onChromeChange?: (chrome: { title: string; onBack: () => void } | null) => void
}

export function GameHub({ onChromeChange }: GameHubProps) {
  const { user } = useStore()
  const [state, setState] = useState<State>({ view: 'hub' })
  const [submitting, setSubmitting] = useState(false)

  function startGame(gameId: GameId) {
    setState({ view: 'playing', gameId })
  }

  function handleDone(gameId: GameId, score: number) {
    setState({ view: 'done', gameId, score, submittedInitials: null })
  }

  async function handleSubmit(initials: string, emoji: string) {
    if (state.view !== 'done') return
    setSubmitting(true)
    try {
      await submitScore(
        state.gameId,
        user?.uid ?? 'guest',
        initials,
        emoji,
        state.score,
      )
      setState({ ...state, submittedInitials: initials })
    } catch {
      // silently ignore — leaderboard won't update but don't crash
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!onChromeChange) return
    if (state.view === 'hub') {
      onChromeChange(null)
      return
    }

    const meta = GAMES.find(g => g.id === state.gameId)
    onChromeChange(
      meta
        ? {
            title: meta.title,
            onBack: () => setState({ view: 'hub' }),
          }
        : null,
    )

    return () => {
      onChromeChange(null)
    }
  }, [onChromeChange, state])

  if (state.view === 'hub') {
    return (
      <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide">Games</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Practice your statistical intuition. Top scores refresh every 2 weeks.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {GAMES.map(game => (
              <div key={game.id} className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
                {/* Game card header */}
                <div className="p-4 flex items-center gap-3 border-b border-[var(--color-border)]">
                  <span className="text-2xl flex-shrink-0">{game.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--color-text)] text-sm">{game.title}</div>
                    <div className="text-xs text-[var(--color-muted)] mt-0.5 leading-snug">{game.description}</div>
                  </div>
                  <button
                    onClick={() => startGame(game.id)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Play
                  </button>
                </div>
                {/* Inline leaderboard */}
                <div className="flex-1">
                  <Leaderboard gameId={game.id} compact />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (state.view !== 'playing' && state.view !== 'done') return null
  const gameMeta = GAMES.find(g => g.id === state.gameId)!

  if (state.view === 'playing') {
    const containerClass = gameMeta.wide
      ? 'w-full max-w-[98vw] 2xl:max-w-[1880px] mx-auto py-6 px-3 space-y-4'
      : 'max-w-lg mx-auto py-6 px-4 space-y-4'
    return (
      <div className={containerClass}>
        <div className="w-full bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4">
          {state.gameId === GAME_IDS.guessCorrelation && (
            <GuessCorrelation onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.moreVariability && (
            <MoreVariability onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.guessResidual && (
            <GuessResidual onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.meanVsMedian && (
            <MeanVsMedian onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.yacht && (
            <Yacht onDone={s => handleDone(state.gameId, s)} />
          )}
        </div>
      </div>
    )
  }

  // Done screen
  const doneContainerClass = gameMeta.wide
    ? 'w-full max-w-[98vw] 2xl:max-w-[1880px] mx-auto py-6 px-3 space-y-4'
    : 'max-w-lg mx-auto py-6 px-4 space-y-4'
  return (
    <div className={doneContainerClass}>
      <div className="w-full bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5">
        {state.submittedInitials === null ? (
          <ScoreEntry
            score={state.score}
            maxScore={gameMeta.maxScore}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        ) : (
          <div className="text-center space-y-1 py-2">
            <div className="text-[var(--color-accent-strong)] font-semibold">✓ Score submitted!</div>
            <div className="text-4xl font-bold text-[var(--color-accent)] tabular-nums">
              {state.score} <span className="text-lg font-normal text-[var(--color-muted)]">/ {gameMeta.maxScore}</span>
            </div>
          </div>
        )}
      </div>

      {state.submittedInitials !== null && (
        <Leaderboard gameId={state.gameId} highlightInitials={state.submittedInitials} />
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setState({ view: 'playing', gameId: state.gameId })}
          className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium hover:border-[var(--color-accent)] transition-colors"
        >
          Play Again
        </button>
        <button
          onClick={() => setState({ view: 'hub' })}
          className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          All Games
        </button>
      </div>
    </div>
  )
}
