'use client'

import { useState } from 'react'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { generateNormal, generateSkewed, ROUNDS_PER_GAME } from '@/lib/gameData'

interface Props { onDone: (score: number) => void }

type Phase = 'choosing' | 'revealed'
type Answer = 'mean-greater' | 'median-greater' | 'equal'

function stat(values: number[], fn: (v: number[]) => number) { return fn(values) }
function mean(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length }
function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function generateRound() {
  const type = Math.random() < 0.33 ? 'right' : Math.random() < 0.5 ? 'left' : 'symmetric'
  let data: number[]
  if (type === 'right') data = generateSkewed(60, 'right')
  else if (type === 'left') data = generateSkewed(60, 'left')
  else data = generateNormal(60, 10, 2)

  const m = stat(data, mean)
  const med = stat(data, median)
  const diff = m - med
  const correct: Answer =
    Math.abs(diff) < 0.15 * stat(data, v => Math.max(...v) - Math.min(...v))
      ? 'equal'
      : diff > 0 ? 'mean-greater' : 'median-greater'
  return { data, mean: m, median: med, correct }
}

const ANSWER_OPTIONS: { value: Answer; label: string }[] = [
  { value: 'mean-greater',   label: 'Mean > Median' },
  { value: 'median-greater', label: 'Median > Mean' },
  { value: 'equal',          label: 'About Equal' },
]

export function MeanVsMedian({ onDone }: Props) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('choosing')
  const [chosen, setChosen] = useState<Answer | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [roundData, setRoundData] = useState(() => generateRound())

  const isCorrect = chosen !== null && chosen === roundData.correct

  function choose(a: Answer) {
    if (phase !== 'choosing') return
    setChosen(a)
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

  const correctLabel = ANSWER_OPTIONS.find(o => o.value === roundData.correct)?.label ?? ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">Round {round + 1} of {ROUNDS_PER_GAME}</span>
        <span className="font-semibold">{totalScore} pts</span>
      </div>
      <p className="text-sm text-center text-[var(--color-muted)]">
        For this distribution, which is larger — the <strong>mean</strong> or the <strong>median</strong>?
      </p>

      <PlotlyChart
        data={[{
          type: 'histogram' as const,
          x: roundData.data,
          marker: { color: 'var(--color-accent)', opacity: 0.8 },
          nbinsx: 20,
          hoverinfo: 'skip',
        }] as unknown as import('plotly.js').Data[]}
        layout={{
          xaxis: { showticklabels: true, zeroline: false, title: { text: '' } },
          yaxis: { showticklabels: false, zeroline: false, title: { text: '' } },
          showlegend: false,
          margin: { t: 20, b: 36, l: 16, r: 16 },
          ...(phase === 'revealed' ? {
            shapes: [
              { type: 'line' as const, x0: roundData.mean, x1: roundData.mean, y0: 0, y1: 1, yref: 'paper' as const, line: { color: '#0EA5A0', width: 2.5 } },
              { type: 'line' as const, x0: roundData.median, x1: roundData.median, y0: 0, y1: 1, yref: 'paper' as const, line: { color: '#F59E0B', width: 2.5, dash: 'dash' } },
            ],
          } : {}),
        }}
        height={240}
      />

      {phase === 'revealed' && (
        <div className="flex justify-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[var(--color-accent)] inline-block" /> Mean = {roundData.mean.toFixed(2)}</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-amber-400 inline-block" /> Median = {roundData.median.toFixed(2)}</span>
        </div>
      )}

      {phase === 'choosing' ? (
        <div className="grid grid-cols-3 gap-2">
          {ANSWER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => choose(opt.value)}
              className="py-2.5 rounded-xl border-2 border-slate-200 text-sm font-medium hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-all"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className={`text-center py-2 rounded-xl font-semibold text-sm ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {isCorrect ? '✓ Correct! +100 pts' : `✗ Wrong — answer was "${correctLabel}"`}
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
