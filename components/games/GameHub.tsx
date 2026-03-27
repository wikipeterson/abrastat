'use client'

import { useState } from 'react'
import { GAME_IDS, GameId, submitScore } from '@/lib/leaderboard'
import { ROUNDS_PER_GAME } from '@/lib/gameData'
import { useStore } from '@/lib/store'
import { ScoreEntry } from './ScoreEntry'
import { Leaderboard } from './Leaderboard'
import { GuessCorrelation } from './GuessCorrelation'
import { MoreVariability } from './MoreVariability'
import { RealOrRandom } from './RealOrRandom'
import { GuessResidual } from './GuessResidual'
import { MeanVsMedian } from './MeanVsMedian'

const GAMES: {
  id: GameId
  icon: string
  title: string
  description: string
  maxScore: number
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
    id: GAME_IDS.realOrRandom,
    icon: '🌍',
    title: 'Real or Random?',
    description: `Is the scatter plot a real-world relationship or random noise? ${ROUNDS_PER_GAME} rounds.`,
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
]

type State =
  | { view: 'hub' }
  | { view: 'playing'; gameId: GameId }
  | { view: 'done'; gameId: GameId; score: number; submittedInitials: string | null }

export function GameHub() {
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

  if (state.view === 'hub') {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text)]">Stats Games</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Practice your statistical intuition. Top scores refresh every 2 weeks.
          </p>
        </div>
        <div className="grid gap-3">
          {GAMES.map(game => (
            <div
              key={game.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4"
            >
              <span className="text-3xl flex-shrink-0">{game.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[var(--color-text)]">{game.title}</div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">{game.description}</div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">Max score: {game.maxScore}</div>
              </div>
              <button
                onClick={() => startGame(game.id)}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Play
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const gameMeta = GAMES.find(g => g.id === state.gameId)!

  if (state.view === 'playing') {
    return (
      <div className="max-w-lg mx-auto py-6 px-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setState({ view: 'hub' })}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            ← Back
          </button>
          <span className="text-lg font-semibold text-[var(--color-text)]">
            {gameMeta.icon} {gameMeta.title}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          {state.gameId === GAME_IDS.guessCorrelation && (
            <GuessCorrelation onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.moreVariability && (
            <MoreVariability onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.realOrRandom && (
            <RealOrRandom onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.guessResidual && (
            <GuessResidual onDone={s => handleDone(state.gameId, s)} />
          )}
          {state.gameId === GAME_IDS.meanVsMedian && (
            <MeanVsMedian onDone={s => handleDone(state.gameId, s)} />
          )}
        </div>
      </div>
    )
  }

  // Done screen
  return (
    <div className="max-w-lg mx-auto py-6 px-4 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        {state.submittedInitials === null ? (
          <ScoreEntry
            score={state.score}
            maxScore={gameMeta.maxScore}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        ) : (
          <div className="text-center space-y-1 py-2">
            <div className="text-green-600 font-semibold">✓ Score submitted!</div>
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
