'use client'

import { useState } from 'react'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { generateNormal, ROUNDS_PER_GAME } from '@/lib/gameData'

interface Props { onDone: (score: number) => void }

type Phase = 'choosing' | 'revealed'
type Side = 'left' | 'right'

function generateRound() {
  // Pick two clearly different std devs
  const pool = [0.5, 0.8, 1.2, 1.8, 2.5, 3.5]
  const aIdx = Math.floor(Math.random() * pool.length)
  let bIdx = aIdx
  while (Math.abs(bIdx - aIdx) < 2) bIdx = Math.floor(Math.random() * pool.length)
  const stdA = pool[aIdx], stdB = pool[bIdx]
  const mean = 10 + Math.random() * 5
  return {
    left: generateNormal(50, mean, stdA),
    right: generateNormal(50, mean, stdB),
    leftStd: stdA,
    rightStd: stdB,
    correct: stdA > stdB ? 'left' : 'right' as Side,
  }
}

export function MoreVariability({ onDone }: Props) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('choosing')
  const [chosen, setChosen] = useState<Side | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [roundData, setRoundData] = useState(() => generateRound())

  const isCorrect = chosen !== null && chosen === roundData.correct

  function choose(side: Side) {
    if (phase !== 'choosing') return
    setChosen(side)
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
      setRoundData(generateRound())
      setChosen(null)
      setPhase('choosing')
    }
  }

  function makeTrace(data: number[], color: string) {
    return [{
      type: 'histogram' as const,
      x: data,
      marker: { color, opacity: 0.8 },
      nbinsx: 15,
      hoverinfo: 'skip' as const,
    }] as unknown as import('plotly.js').Data[]
  }

  const leftBorder = phase === 'revealed'
    ? (roundData.correct === 'left' ? 'ring-2 ring-[var(--color-accent)]' : chosen === 'left' ? 'ring-2 ring-[var(--color-danger)]' : '')
    : ''
  const rightBorder = phase === 'revealed'
    ? (roundData.correct === 'right' ? 'ring-2 ring-[var(--color-accent)]' : chosen === 'right' ? 'ring-2 ring-[var(--color-danger)]' : '')
    : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">Round {round + 1} of {ROUNDS_PER_GAME}</span>
        <span className="font-semibold">{totalScore} pts</span>
      </div>
      <p className="text-sm text-center text-[var(--color-muted)]">Which distribution has <strong>more variability</strong>?</p>

      <div className="grid grid-cols-2 gap-3">
        {(['left', 'right'] as Side[]).map(side => (
          <button
            key={side}
            onClick={() => choose(side)}
            disabled={phase === 'revealed'}
            className={`rounded-xl border-2 overflow-hidden transition-all ${
              chosen === side ? '' : 'hover:border-[var(--color-accent)]'
            } ${side === 'left' ? leftBorder : rightBorder} border-[var(--color-border)]`}
          >
            <div className="text-xs font-mono font-semibold text-center py-1 bg-[var(--color-bg)] uppercase tracking-wide text-[var(--color-muted)]">
              {side === 'left' ? 'A' : 'B'}
              {phase === 'revealed' && (
                <span className="ml-1 font-normal normal-case">
                  (SD = {(side === 'left' ? roundData.leftStd : roundData.rightStd).toFixed(1)})
                </span>
              )}
            </div>
            <PlotlyChart
              data={makeTrace(
                side === 'left' ? roundData.left : roundData.right,
                side === 'left' ? '#0EA5A0' : '#6366F1'
              )}
              layout={{
                xaxis: { showticklabels: false, zeroline: false },
                yaxis: { showticklabels: false, zeroline: false },
                showlegend: false,
                margin: { t: 8, b: 8, l: 8, r: 8 },
              }}
              height={150}
              mode="fixed"
            />
          </button>
        ))}
      </div>

      {phase === 'revealed' && (
        <div className="space-y-3">
          <div className={`text-center py-2 rounded-xl font-semibold ${isCorrect ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]' : 'bg-[var(--color-danger-light)] text-[var(--color-danger)]'}`}>
            {isCorrect ? '✓ Correct! +100 pts' : `✗ Wrong — ${roundData.correct === 'left' ? 'A' : 'B'} had more spread`}
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
