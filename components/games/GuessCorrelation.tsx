'use client'

import { useState, useMemo } from 'react'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import {
  generateCorrelatedPairs,
  correlationScore,
  pickUnique,
  CORRELATION_POOL,
  ROUNDS_PER_GAME,
} from '@/lib/gameData'

interface Props { onDone: (score: number) => void }

type Phase = 'guessing' | 'revealed'

export function GuessCorrelation({ onDone }: Props) {
  const targets = useMemo(() => pickUnique(CORRELATION_POOL, ROUNDS_PER_GAME), [])
  const [round, setRound] = useState(0)
  const [guess, setGuess] = useState(0)
  const [phase, setPhase] = useState<Phase>('guessing')
  const [scores, setScores] = useState<number[]>([])

  const target = targets[round]
  const { x, y } = useMemo(() => generateCorrelatedPairs(60, target), [target])

  const roundScore = phase === 'revealed' ? correlationScore(guess, target) : null
  const totalSoFar = scores.reduce((a, b) => a + b, 0) + (roundScore ?? 0)

  function submit() { setPhase('revealed') }

  function next() {
    const s = correlationScore(guess, target)
    const newScores = [...scores, s]
    if (round + 1 >= ROUNDS_PER_GAME) {
      onDone(newScores.reduce((a, b) => a + b, 0))
    } else {
      setScores(newScores)
      setRound(r => r + 1)
      setGuess(0)
      setPhase('guessing')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">Round {round + 1} of {ROUNDS_PER_GAME}</span>
        <span className="font-semibold text-[var(--color-text)]">Score: {totalSoFar}</span>
      </div>

      <PlotlyChart
        data={[{
          type: 'scatter' as const,
          mode: 'markers',
          x, y,
          marker: { color: 'var(--color-accent)', size: 7, opacity: 0.7 },
          hoverinfo: 'skip',
        }]}
        layout={{
          xaxis: { title: { text: '' }, showticklabels: false, zeroline: false },
          yaxis: { title: { text: '' }, showticklabels: false, zeroline: false },
          showlegend: false,
          margin: { t: 20, b: 20, l: 20, r: 20 },
        }}
        height={280}
        mode="fixed"
      />

      {phase === 'guessing' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--color-muted)] w-8 text-right">−1</span>
            <input
              type="range" min={-1} max={1} step={0.01}
              value={guess}
              onChange={e => setGuess(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--color-accent)]"
            />
            <span className="text-sm text-[var(--color-muted)] w-6">+1</span>
          </div>
          <div className="text-center text-2xl font-bold tabular-nums text-[var(--color-accent)]">
            r = {guess.toFixed(2)}
          </div>
          <button
            onClick={submit}
            className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Submit Guess
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 text-center gap-2">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-[var(--color-muted)] mb-1">Your guess</div>
              <div className="text-xl font-bold tabular-nums">{guess.toFixed(2)}</div>
            </div>
            <div className="bg-[var(--color-accent-light)] rounded-xl p-3">
              <div className="text-xs text-[var(--color-muted)] mb-1">Actual r</div>
              <div className="text-xl font-bold tabular-nums text-[var(--color-accent)]">{target.toFixed(2)}</div>
            </div>
            <div className={`rounded-xl p-3 ${(roundScore ?? 0) >= 80 ? 'bg-green-50' : (roundScore ?? 0) >= 50 ? 'bg-yellow-50' : 'bg-red-50'}`}>
              <div className="text-xs text-[var(--color-muted)] mb-1">Points</div>
              <div className="text-xl font-bold tabular-nums">{roundScore}</div>
            </div>
          </div>
          <button
            onClick={next}
            className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            {round + 1 >= ROUNDS_PER_GAME ? 'See Final Score' : 'Next Round →'}
          </button>
        </div>
      )}
    </div>
  )
}
