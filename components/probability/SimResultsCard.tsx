'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { SimResultsCardConfig } from '@/lib/exploreTypes'

function compareToThreshold(value: number, threshold: number, op: '<' | '<=' | '>' | '>=') {
  switch (op) {
    case '<': return value < threshold
    case '<=': return value <= threshold
    case '>': return value > threshold
    case '>=': return value >= threshold
  }
}

function deriveTrackedValues(
  rolls: number[][],
  trackedMode: 'sum' | 'difference',
  valueMode: 'count' | 'proportion' = 'count',
): number[] {
  if (valueMode === 'proportion') {
    return rolls
      .filter(roll => roll.length > 0)
      .map(roll => (roll.reduce((sum, value) => sum + value, 0) / roll.length) * 100)
  }
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
  labels,
  onSelect,
}: {
  mode: 'sum' | 'difference'
  supportsDifference: boolean
  labels?: { primary: string; secondary: string }
  onSelect: (m: 'sum' | 'difference') => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-[10px]">
      <button
        onClick={() => onSelect('sum')}
        className={`px-2.5 py-1 transition-colors ${
          mode === 'sum'
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
        }`}
      >
        {labels?.primary ?? 'Sum'}
      </button>
      {supportsDifference && (
        <button
          onClick={() => onSelect('difference')}
          className={`px-2.5 py-1 border-l border-[var(--color-border)] transition-colors ${
            mode === 'difference'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
          }`}
        >
          {labels?.secondary ?? '|Δ|'}
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
  tickValues?: number[]
  tickFormat?: (value: number) => string
  enteringKeys?: Set<string>
}

function DotPlot({ values, trackedMode, minValue, maxValue, xLabel, tickValues, tickFormat, enteringKeys }: DotPlotProps) {
  const clipId = useId()

  // Count occurrences
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const defaultDomainValues = Array.from(
    { length: Math.max(1, Math.round(maxValue - minValue) + 1) },
    (_, index) => minValue + index,
  )
  const domainValues = tickValues ?? defaultDomainValues

  const VIEW_W = 400
  const VIEW_H = 220
  const MG = { t: 12, r: 16, b: 32, l: 16 }
  const plotW = VIEW_W - MG.l - MG.r
  const plotH = VIEW_H - MG.t - MG.b
  const maxCount = Math.max(1, ...counts.values(), 1)
  const stackStep = Math.min(13, plotH / maxCount)
  const DOT_R = Math.max(2, Math.min(6, stackStep / 2 - 0.35))

  const xOf = (v: number) =>
    minValue === maxValue ? plotW / 2 : ((v - minValue) / (maxValue - minValue)) * plotW

  // Choose which tick labels to show (cap at ~10) across the full theoretical range.
  const ticks =
    domainValues.length <= 10
      ? domainValues
      : domainValues.filter((_, i, arr) =>
          i === 0 || i === arr.length - 1 || i % Math.ceil(arr.length / 9) === 0,
        )

  // Build dot positions in append order so newly-added points can animate in
  const seenCounts = new Map<number, number>()
  const circles: { cx: number; cy: number; key: string }[] = []
  for (let index = 0; index < values.length; index++) {
    const val = values[index]
    const stackIndex = seenCounts.get(val) ?? 0
    seenCounts.set(val, stackIndex + 1)
    const cx = xOf(val)
    circles.push({
      cx,
      cy: plotH - stackIndex * stackStep - DOT_R,
      key: `${val}-${index}`,
    })
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
      <style>{`
        @keyframes sim-dot-drop {
          from {
            transform: translateY(-56px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 0.88;
          }
        }
      `}</style>
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
              {tickFormat ? tickFormat(v) : v}
            </text>
          </g>
        ))}

        {/* Dots (clipped to plot area) */}
        <g clipPath={`url(#${clipId})`}>
          {circles.map(({ cx, cy, key }) => (
            <g
              key={key}
              transform={`translate(${cx},${cy})`}
              style={
                enteringKeys?.has(key)
                  ? {
                      animation: 'sim-dot-drop 320ms ease-out',
                    }
                  : undefined
              }
            >
              <circle
                cx={0}
                cy={0}
                r={DOT_R - 0.5}
                fill="#0EA5A0"
                opacity={0.88}
              />
            </g>
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
  const {
    values,
    trackedMode,
    valueMode = 'count',
    thresholdOp = '>=',
    thresholdValue,
    sourceLabel,
    valueLabel,
    minValue,
    maxValue,
    rolls,
    supportsDifference,
  } = config
  const displaySourceLabel = sourceLabel === 'Coin Flip Simulator' ? 'Coin Flipper' : sourceLabel
  const isCoinFlipper = displaySourceLabel === 'Coin Flipper'
  const [displayedValues, setDisplayedValues] = useState(values)
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set())
  const previousValuesRef = useRef(values)
  const timeoutIdsRef = useRef<number[]>([])
  const rollCount = displayedValues.length
  const xLabel = isCoinFlipper
    ? (valueMode === 'proportion' ? '% Heads' : 'Heads')
    : valueLabel ?? (trackedMode === 'sum' ? 'Sum' : '|Difference|')
  const emptyMessage = displaySourceLabel === 'Coin Flipper'
    ? 'Run the coin flipper to start recording outcomes.'
    : 'Roll to start recording outcomes.'
  const tickValues = isCoinFlipper && valueMode === 'proportion'
    ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    : undefined
  const activeThresholdValue = thresholdValue ?? (valueMode === 'proportion' ? 50 : maxValue / 2)
  const matchingCount = displayedValues.filter(value => compareToThreshold(value, activeThresholdValue, thresholdOp)).length
  const matchingProportion = rollCount > 0 ? matchingCount / rollCount : 0

  useEffect(() => {
    timeoutIdsRef.current.forEach(id => window.clearTimeout(id))
    timeoutIdsRef.current = []

    const previous = previousValuesRef.current
    const samePrefix = previous.every((value, index) => values[index] === value)
    const delta = values.length - previous.length

    if (!samePrefix || delta <= 0) {
      previousValuesRef.current = values
      const resetId = window.setTimeout(() => {
        setDisplayedValues(values)
        setEnteringKeys(new Set())
      }, 0)
      timeoutIdsRef.current.push(resetId)
      return
    }

    if (delta > 10) {
      previousValuesRef.current = values
      const syncId = window.setTimeout(() => {
        setDisplayedValues(values)
        setEnteringKeys(new Set())
      }, 0)
      timeoutIdsRef.current.push(syncId)
      return
    }

    const prepId = window.setTimeout(() => {
      setDisplayedValues(previous)
      setEnteringKeys(new Set())
    }, 0)
    timeoutIdsRef.current.push(prepId)

    for (let offset = 0; offset < delta; offset++) {
      const appendIndex = previous.length + offset
      const nextValue = values[appendIndex]
      const key = `${nextValue}-${appendIndex}`
      const revealId = window.setTimeout(() => {
        setDisplayedValues(current => [...current, nextValue])
        setEnteringKeys(current => new Set(current).add(key))
        const clearId = window.setTimeout(() => {
          setEnteringKeys(current => {
            const next = new Set(current)
            next.delete(key)
            return next
          })
        }, 360)
        timeoutIdsRef.current.push(clearId)
      }, offset * 110)
      timeoutIdsRef.current.push(revealId)
    }

    previousValuesRef.current = values

    return () => {
      timeoutIdsRef.current.forEach(id => window.clearTimeout(id))
      timeoutIdsRef.current = []
    }
  }, [values])

  function handleModeChange(mode: 'sum' | 'difference') {
    if (mode === 'difference' && !supportsDifference) return
    if (mode === trackedMode) return
    updateExploreCard(cardId, {
      config: {
        ...config,
        trackedMode: mode,
        values: deriveTrackedValues(rolls, mode, valueMode),
      },
    })
  }

  function handleCoinValueMode(mode: 'count' | 'proportion') {
    if (mode === valueMode) return
    updateExploreCard(cardId, {
      config: {
        ...config,
        valueMode: mode,
        minValue: mode === 'proportion' ? 0 : 0,
        maxValue: mode === 'proportion' ? 100 : (rolls[0]?.length ?? maxValue),
        thresholdValue:
          mode === 'proportion'
            ? 50
            : Math.round((rolls[0]?.length ?? maxValue) / 2),
        values: deriveTrackedValues(rolls, trackedMode, mode),
      },
    })
  }

  function handleThresholdOpChange(op: '<' | '<=' | '>' | '>=') {
    updateExploreCard(cardId, {
      config: {
        ...config,
        thresholdOp: op,
      },
    })
  }

  function handleThresholdValueChange(nextValue: number) {
    const bounded = valueMode === 'proportion'
      ? Math.max(0, Math.min(100, nextValue))
      : Math.max(0, Math.min(rolls[0]?.length ?? maxValue, nextValue))
    updateExploreCard(cardId, {
      config: {
        ...config,
        thresholdValue: bounded,
      },
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Meta strip ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2
                      border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {displaySourceLabel}
          </span>
          {isCoinFlipper ? (
            <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-[10px]">
              <button
                onClick={() => handleCoinValueMode('count')}
                className={`px-2.5 py-1 transition-colors ${
                  valueMode === 'count'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
                }`}
              >
                Heads
              </button>
              <button
                onClick={() => handleCoinValueMode('proportion')}
                className={`px-2.5 py-1 border-l border-[var(--color-border)] transition-colors ${
                  valueMode === 'proportion'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
                }`}
              >
                % Heads
              </button>
            </div>
          ) : (
            <ModeSelector mode={trackedMode} supportsDifference={supportsDifference} onSelect={handleModeChange} />
          )}
          <span className="text-[10px] text-[var(--color-muted)]">
            {rollCount.toLocaleString()} {isCoinFlipper ? `group${rollCount !== 1 ? 's' : ''}` : `roll${rollCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        <button
          onClick={() => clearSimResults(cardId)}
          disabled={rollCount === 0}
          className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-danger)]
                     disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>

      {isCoinFlipper && (
        <div className="flex-shrink-0 border-b border-[var(--color-border)] bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
            <span className="font-mono font-semibold uppercase tracking-wide">Simulated Proportion</span>
            <select
              value={thresholdOp}
              onChange={e => handleThresholdOpChange(e.target.value as '<' | '<=' | '>' | '>=')}
              className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-[12px] text-[var(--color-text)]"
            >
              <option value="<">&lt;</option>
              <option value="<=">&le;</option>
              <option value=">">&gt;</option>
              <option value=">=">&ge;</option>
            </select>
            <input
              type="number"
              min={0}
              max={valueMode === 'proportion' ? 100 : (rolls[0]?.length ?? maxValue)}
              step={valueMode === 'proportion' ? 0.1 : 1}
              value={Number.isFinite(activeThresholdValue) ? activeThresholdValue : ''}
              onChange={e => handleThresholdValueChange(Number(e.target.value))}
              className="w-24 rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-[var(--color-text)]"
            />
            <span className="text-[12px] text-[var(--color-text)]">
              = <span className="font-mono tabular-nums font-semibold">{matchingProportion.toFixed(4)}</span>
            </span>
            <span className="text-[11px] text-[var(--color-muted)]">
              ({matchingCount.toLocaleString()} of {(rollCount || 0).toLocaleString()})
            </span>
          </div>
        </div>
      )}

      {/* ── Dot plot ── */}
      <div className="flex-1 min-h-0 p-4 pt-8">
        {rollCount === 0 ? (
          <div className="flex h-full flex-col justify-end">
            <div className="pb-4 text-center">
              <p className="text-xs text-[var(--color-muted)]">
                {emptyMessage}
              </p>
            </div>
            <div className="flex justify-center">
              <DotPlot
                values={displayedValues}
                trackedMode={trackedMode}
                minValue={minValue}
                maxValue={maxValue}
                xLabel={xLabel}
                tickValues={tickValues}
                enteringKeys={enteringKeys}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-end">
            <DotPlot
              values={displayedValues}
              trackedMode={trackedMode}
              minValue={minValue}
              maxValue={maxValue}
              xLabel={xLabel}
              tickValues={tickValues}
              enteringKeys={enteringKeys}
            />
          </div>
        )}
      </div>

      {/* ── Stats footer (shown when at least 2 values) ── */}
      {rollCount >= 2 && (() => {
        const sorted = [...displayedValues].sort((a, b) => a - b)
        const mean  = displayedValues.reduce((s, v) => s + v, 0) / rollCount
        const min   = sorted[0]
        const max   = sorted[sorted.length - 1]
        return (
          <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2
                          border-t border-[var(--color-border)] bg-[var(--color-bg)]">
            {[
              { label: 'Mean', val: mean.toFixed(2) },
              { label: 'Min',  val: String(min) },
              { label: 'Max',  val: String(max) },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wide">{label}</div>
                <div className="text-sm font-mono tabular-nums font-bold text-[var(--color-text)]">{val}</div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
