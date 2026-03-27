'use client'

import { useState } from 'react'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { generateNormal, linearFit, ROUNDS_PER_GAME } from '@/lib/gameData'

interface Props { onDone: (score: number) => void }

type Phase = 'choosing' | 'revealed'

function generateRound() {
  const n = 40
  const x = generateNormal(n, 5, 2)
  const trueResiduals = generateNormal(n, 0, 1)
  const y = x.map((xi, i) => 1.5 * xi + 3 + trueResiduals[i])
  const { residuals } = linearFit(x, y)

  // 4 options: correct + 3 distractors
  const shuffled = [...x].sort(() => Math.random() - 0.5)
  const wrongA = shuffled.map((xi, i) => residuals[i] * xi * 0.3) // fake pattern
  const wrongB = residuals.map(r => -r)                            // mirror
  const wrongC = generateNormal(n, 1.5, 1.2)                      // shifted/skewed

  const options = [
    { label: 'A', x: x.map(xi => xi), y: residuals },
    { label: 'B', x: x.map(xi => xi), y: wrongA },
    { label: 'C', x: x.map(xi => xi), y: wrongB },
    { label: 'D', x: x.map(xi => xi), y: wrongC },
  ]
  // Shuffle options and remember which is correct
  const shuffledOptions = [...options].sort(() => Math.random() - 0.5)
  const correctLabel = shuffledOptions.find(o => o.label === 'A')?.label ?? 'A'
  const relabeled = shuffledOptions.map((o, i) => ({
    ...o,
    displayLabel: String.fromCharCode(65 + i),
    isCorrect: o.label === 'A',
  }))
  return { x, y, slope: 1.5, intercept: 3, options: relabeled, correctLabel }
}

export function GuessResidual({ onDone }: Props) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('choosing')
  const [chosen, setChosen] = useState<string | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [roundData, setRoundData] = useState(() => generateRound())

  const chosenOpt = roundData.options.find(o => o.displayLabel === chosen)
  const isCorrect = chosenOpt?.isCorrect ?? false

  function choose(label: string) {
    if (phase !== 'choosing') return
    setChosen(label)
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

  const xMin = Math.min(...roundData.x)
  const xMax = Math.max(...roundData.x)
  const fitY = [xMin, xMax].map(xi => 1.5 * xi + 3)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">Round {round + 1} of {ROUNDS_PER_GAME}</span>
        <span className="font-semibold">{totalScore} pts</span>
      </div>
      <p className="text-sm text-center text-[var(--color-muted)]">
        Which plot shows the <strong>residuals</strong> for this regression?
      </p>

      <PlotlyChart
        data={[
          {
            type: 'scatter' as const, mode: 'markers',
            x: roundData.x, y: roundData.y,
            marker: { color: 'var(--color-accent)', size: 6, opacity: 0.7 },
            hoverinfo: 'skip',
          },
          {
            type: 'scatter' as const, mode: 'lines',
            x: [xMin, xMax], y: fitY,
            line: { color: '#EF4444', width: 2, dash: 'dash' },
            hoverinfo: 'skip',
          },
        ]}
        layout={{
          xaxis: { showticklabels: false, zeroline: false, title: { text: 'x' } },
          yaxis: { showticklabels: false, zeroline: false, title: { text: 'y' } },
          showlegend: false,
          margin: { t: 16, b: 32, l: 32, r: 16 },
        }}
        height={220}
      />

      <div className="grid grid-cols-2 gap-2">
        {roundData.options.map(opt => {
          const correct = phase === 'revealed' && opt.isCorrect
          const wrong = phase === 'revealed' && !opt.isCorrect && chosen === opt.displayLabel
          return (
            <button
              key={opt.displayLabel}
              onClick={() => choose(opt.displayLabel)}
              disabled={phase === 'revealed'}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                correct ? 'border-green-500' : wrong ? 'border-red-400' : chosen === opt.displayLabel ? 'border-[var(--color-accent)]' : 'border-slate-200 hover:border-[var(--color-accent)]'
              }`}
            >
              <div className="text-xs font-semibold text-center py-0.5 bg-slate-50 text-[var(--color-muted)]">
                {opt.displayLabel}
                {correct && ' ✓'}
                {wrong && ' ✗'}
              </div>
              <PlotlyChart
                data={[{
                  type: 'scatter' as const, mode: 'markers',
                  x: opt.x, y: opt.y,
                  marker: { color: '#6366F1', size: 5, opacity: 0.7 },
                  hoverinfo: 'skip',
                }]}
                layout={{
                  shapes: [{ type: 'line' as const, x0: Math.min(...opt.x), x1: Math.max(...opt.x), y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dash', width: 1 } }],
                  xaxis: { showticklabels: false, zeroline: false },
                  yaxis: { showticklabels: false, zeroline: false },
                  showlegend: false,
                  margin: { t: 4, b: 4, l: 4, r: 4 },
                }}
                height={120}
              />
            </button>
          )
        })}
      </div>

      {phase === 'revealed' && (
        <div className="space-y-2">
          <div className={`text-center py-2 rounded-xl font-semibold text-sm ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {isCorrect ? '✓ Correct! +100 pts' : `✗ Wrong — the correct residual plot has random scatter around zero`}
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
