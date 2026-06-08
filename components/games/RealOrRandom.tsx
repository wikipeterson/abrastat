'use client'

import { useState } from 'react'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { getRealOrRandomRound, ROUNDS_PER_GAME } from '@/lib/gameData'

interface Props { onDone: (score: number) => void }

type Phase = 'choosing' | 'revealed'

export function RealOrRandom({ onDone }: Props) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('choosing')
  const [guessedReal, setGuessedReal] = useState<boolean | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [roundData, setRoundData] = useState(() => getRealOrRandomRound())

  const isCorrect = guessedReal !== null && guessedReal === roundData.isReal

  function choose(isReal: boolean) {
    if (phase !== 'choosing') return
    setGuessedReal(isReal)
    setPhase('revealed')
  }

  function next() {
    const pts = isCorrect ? 100 : 0
    const newTotal = totalScore + pts
    if (round >= ROUNDS_PER_GAME) {
      onDone(newTotal)
    } else {
      setTotalScore(newTotal)
      setRound(r => r + 1)
      setRoundData(getRealOrRandomRound())
      setGuessedReal(null)
      setPhase('choosing')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">Round {round + 1} of {ROUNDS_PER_GAME}</span>
        <span className="font-semibold">{totalScore} pts</span>
      </div>
      <p className="text-sm font-serif italic text-center text-[var(--color-text)]">
        Is this a <strong>real-world relationship</strong> or <strong>random noise</strong>?
      </p>

      <PlotlyChart
        data={[{
          type: 'scatter' as const,
          mode: 'markers',
          x: roundData.x,
          y: roundData.y,
          marker: { color: 'var(--color-accent)', size: 7, opacity: 0.7 },
          hoverinfo: 'skip',
        }]}
        layout={{
          xaxis: { showticklabels: false, zeroline: false, title: { text: '' } },
          yaxis: { showticklabels: false, zeroline: false, title: { text: '' } },
          showlegend: false,
          margin: { t: 20, b: 20, l: 20, r: 20 },
        }}
        height={260}
        mode="fixed"
      />

      {phase === 'choosing' ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => choose(true)}
            className="py-3 rounded-xl bg-[var(--color-accent-light)] border-2 border-[var(--color-accent-light)] text-[var(--color-accent-strong)] font-semibold hover:opacity-80 transition-colors"
          >
            🌍 Real Data
          </button>
          <button
            onClick={() => choose(false)}
            className="py-3 rounded-xl bg-[var(--color-bg)] border-2 border-[var(--color-border)] text-[var(--color-text)] font-semibold hover:bg-[var(--color-border)] transition-colors"
          >
            🎲 Random
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`text-center py-3 rounded-xl font-semibold ${isCorrect ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]' : 'bg-[var(--color-danger-light)] text-[var(--color-danger)]'}`}>
            {isCorrect ? '✓ Correct! +100 pts' : '✗ Wrong'}
          </div>
          <div className="text-sm font-serif italic text-center text-[var(--color-text)] px-2">
            {roundData.isReal
              ? <>This was <strong>real data</strong>: {roundData.scenarioLabel}</>
              : <>This was <strong>random noise</strong> — no real relationship</>
            }
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
