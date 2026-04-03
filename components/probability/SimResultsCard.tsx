'use client'

import { useId } from 'react'
import { useStore } from '@/lib/store'
import { SimResultsCardConfig } from '@/lib/exploreTypes'

function deriveTrackedValues(
  rolls: number[][],
  trackedMode: 'sum' | 'difference',
): number[] {
  if (trackedMode === 'sum') {
    return rolls.map(roll => roll.reduce((sum, value) => sum + value, 0))
  }
  return rolls
    .filter(roll => roll.length === 2)
    .map(roll => Math.abs(roll[0] - roll[1]))
}

// ── Mode selector ─────────────────────────────────────────────────────────────

function ModeSelector({
  mode,
  supportsDifference,
  onSelect,
}: {
  mode: 'sum' | 'difference'
  supportsDifference: boolean
  onSelect: (m: 'sum' | 'difference') => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-[10px]">
      <button
        onClick={() => onSelect('sum')}
        className={`px-2.5 py-1 transition-colors ${
          mode === 'sum'
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-muted)] hover:bg-slate-50'
        }`}
      >
        Sum
      </button>
      {supportsDifference && (
        <button
          onClick={() => onSelect('difference')}
          className={`px-2.5 py-1 border-l border-[var(--color-border)] transition-colors ${
            mode === 'difference'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-muted)] hover:bg-slate-50'
          }`}
        >
          |Δ|
        </button>
      )}
    </div>
  )
}

// ── Dot plot ──────────────────────────────────────────────────────────────────

interface DotPlotProps {
  values: number[]
  trackedMode: 'sum' | 'difference'
  minValue: number
  maxValue: number
  xLabel: string
}

function DotPlot({ values, trackedMode, minValue, maxValue, xLabel }: DotPlotProps) {
  const clipId = useId()

  // Count occurrences
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const domainValues = Array.from(
    { length: Math.max(1, maxValue - minValue + 1) },
    (_, index) => minValue + index,
  )

  const VIEW_W = 400
  const VIEW_H = 220
  const MG = { t: 12, r: 16, b: 32, l: 16 }
  const plotW = VIEW_W - MG.l - MG.r
  const plotH = VIEW_H - MG.t - MG.b
  const DOT_R = 6

  const xOf = (v: number) =>
    minValue === maxValue ? plotW / 2 : ((v - minValue) / (maxValue - minValue)) * plotW

  // Choose which tick labels to show (cap at ~10) across the full theoretical range.
  const ticks =
    domainValues.length <= 10
      ? domainValues
      : domainValues.filter((_, i, arr) =>
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
          {xLabel}
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
  const clearSimResults  = useStore(s => s.clearSimResults)
  const updateExploreCard = useStore(s => s.updateExploreCard)
  const { values, trackedMode, sourceLabel, valueLabel, minValue, maxValue, rolls, supportsDifference } = config
  const rollCount = values.length
  const xLabel = valueLabel ?? (trackedMode === 'sum' ? 'Sum' : '|Difference|')

  function handleModeChange(mode: 'sum' | 'difference') {
    if (mode === 'difference' && !supportsDifference) return
    if (mode === trackedMode) return
    updateExploreCard(cardId, {
      config: {
        ...config,
        trackedMode: mode,
        values: deriveTrackedValues(rolls, mode),
      },
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Meta strip ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2
                      border-b border-[var(--color-border)] bg-slate-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {sourceLabel}
          </span>
          <ModeSelector mode={trackedMode} supportsDifference={supportsDifference} onSelect={handleModeChange} />
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
      <div className="flex-1 min-h-0 flex flex-col items-center justify-end p-4 pt-8">
        <DotPlot
          values={values}
          trackedMode={trackedMode}
          minValue={minValue}
          maxValue={maxValue}
          xLabel={xLabel}
        />
        {rollCount === 0 && (
          <div className="-mt-8 text-center">
            <p className="text-xs text-[var(--color-muted)]">
              Roll the dice to start recording outcomes.
            </p>
          </div>
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
