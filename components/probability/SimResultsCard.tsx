'use client'

import { useId } from 'react'
import { useStore } from '@/lib/store'
import { SimResultsCardConfig } from '@/lib/exploreTypes'

// ── Dot plot ──────────────────────────────────────────────────────────────────

interface DotPlotProps {
  values: number[]
  trackedMode: 'sum' | 'difference'
}

function DotPlot({ values, trackedMode }: DotPlotProps) {
  const clipId = useId()

  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)

  // Count occurrences
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const uniqueVals = [...counts.keys()].sort((a, b) => a - b)

  const VIEW_W = 400
  const VIEW_H = 220
  const MG = { t: 12, r: 16, b: 32, l: 16 }
  const plotW = VIEW_W - MG.l - MG.r
  const plotH = VIEW_H - MG.t - MG.b
  const DOT_R = 6

  const xOf = (v: number) =>
    uniqueVals.length === 1 ? plotW / 2 : ((v - min) / (max - min)) * plotW

  // Choose which tick labels to show (cap at ~10)
  const ticks =
    uniqueVals.length <= 10
      ? uniqueVals
      : uniqueVals.filter((_, i, arr) =>
          i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 9) === 0,
        )

  // Build dot positions
  const circles: { cx: number; cy: number; key: string }[] = []
  for (const [val, count] of counts) {
    const cx = xOf(val)
    for (let i = 0; i < count; i++) {
      circles.push({
        cx,
        cy: plotH - i * (DOT_R * 2 + 1) - DOT_R,
        key: `${val}-${i}`,
      })
    }
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      style={{ maxHeight: VIEW_H }}
      aria-label={`Dot plot of ${trackedMode === 'sum' ? 'sums' : 'absolute differences'}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={-DOT_R} y={0} width={plotW + DOT_R * 2} height={plotH} />
        </clipPath>
      </defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        {/* Baseline */}
        <line
          x1={0} y1={plotH} x2={plotW} y2={plotH}
          stroke="#E2E8F0" strokeWidth={1.5}
        />

        {/* Tick marks + labels */}
        {ticks.map(v => (
          <g key={v} transform={`translate(${xOf(v)},${plotH})`}>
            <line y2={5} stroke="#CBD5E1" strokeWidth={1} />
            <text
              y={16}
              textAnchor="middle"
              fontSize={10}
              fill="#64748B"
              fontFamily="DM Sans, sans-serif"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Dots (clipped to plot area) */}
        <g clipPath={`url(#${clipId})`}>
          {circles.map(({ cx, cy, key }) => (
            <circle
              key={key}
              cx={cx}
              cy={cy}
              r={DOT_R - 0.5}
              fill="#0EA5A0"
              opacity={0.88}
            />
          ))}
        </g>

        {/* X-axis label */}
        <text
          x={plotW / 2}
          y={plotH + 29}
          textAnchor="middle"
          fontSize={10}
          fill="#94A3B8"
          fontFamily="DM Sans, sans-serif"
        >
          {trackedMode === 'sum' ? 'Sum' : '|Difference|'}
        </text>
      </g>
    </svg>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface SimResultsCardProps {
  cardId: string
  config: SimResultsCardConfig
}

export function SimResultsCard({ cardId, config }: SimResultsCardProps) {
  const clearSimResults = useStore(s => s.clearSimResults)
  const { values, trackedMode, sourceLabel } = config
  const rollCount = values.length

  return (
    <div className="flex flex-col h-full">
      {/* ── Meta strip ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2
                      border-b border-[var(--color-border)] bg-slate-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {sourceLabel}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-light)]
                           text-[var(--color-accent)] font-medium">
            {trackedMode === 'sum' ? 'Sum' : '|Δ|'}
          </span>
          <span className="text-[10px] text-[var(--color-muted)]">
            {rollCount} roll{rollCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => clearSimResults(cardId)}
          disabled={rollCount === 0}
          className="text-[10px] text-[var(--color-muted)] hover:text-red-500
                     disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>

      {/* ── Dot plot ── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4">
        {rollCount === 0 ? (
          <div className="text-center">
            <div className="text-3xl opacity-20 mb-2">⚅</div>
            <p className="text-xs text-[var(--color-muted)]">
              Roll the dice to start recording outcomes.
            </p>
          </div>
        ) : (
          <DotPlot values={values} trackedMode={trackedMode} />
        )}
      </div>

      {/* ── Stats footer (shown when at least 2 values) ── */}
      {rollCount >= 2 && (() => {
        const sorted = [...values].sort((a, b) => a - b)
        const mean  = values.reduce((s, v) => s + v, 0) / rollCount
        const min   = sorted[0]
        const max   = sorted[sorted.length - 1]
        return (
          <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2
                          border-t border-[var(--color-border)] bg-slate-50">
            {[
              { label: 'Mean', val: mean.toFixed(2) },
              { label: 'Min',  val: String(min) },
              { label: 'Max',  val: String(max) },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">{label}</div>
                <div className="text-sm font-bold text-[var(--color-text)]">{val}</div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
