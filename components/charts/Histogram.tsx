'use client'

import { useState, useMemo } from 'react'
import type { Data } from 'plotly.js'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface HistogramProps {
  colId: string | null
  groupColId?: string | null
  orientation?: 'h' | 'v'   // 'h' = values on x-axis (default); 'v' = values on y-axis (horizontal bars)
}

interface HistogramStats {
  min: number
  max: number
  range: number
  allIntegers: boolean
  defaultWidth: number
  sliderStep: number
  sliderMin: number
  sliderMax: number
}

function niceStep(value: number, preferIntegers: boolean) {
  if (!Number.isFinite(value) || value <= 0) return preferIntegers ? 1 : 0.1
  if (preferIntegers) return Math.max(1, Math.round(value))

  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base

  if (fraction <= 1) return base
  if (fraction <= 2) return 2 * base
  if (fraction <= 2.5) return 2.5 * base
  if (fraction <= 5) return 5 * base
  return 10 * base
}

function formatBinWidth(value: number) {
  if (value >= 10 || Number.isInteger(value)) return String(Math.round(value * 1000) / 1000)
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function Histogram({ colId, groupColId, orientation = 'h' }: HistogramProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()

  const col = grid.columns.find(c => c.id === colId)
  const groupCol = groupColId ? grid.columns.find(c => c.id === groupColId) : null

  const values = useMemo(() => colId ? getNumericValues(grid, colId) : [], [grid, colId])
  const stats = useMemo(() => {
    if (values.length === 0) {
      return { min: 0, max: 1, range: 1, allIntegers: false, defaultWidth: 1, sliderStep: 0.1, sliderMin: 0.1, sliderMax: 5 }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    const allIntegers = values.every(v => Number.isInteger(v))
    const defaultBins = Math.max(5, Math.ceil(Math.log2(values.length) + 1))
    const rawDefaultWidth = range > 0 ? range / defaultBins : 1
    const defaultWidth = niceStep(rawDefaultWidth, allIntegers)
    const sliderStep = niceStep(range > 0 ? range / 100 : defaultWidth / 10, allIntegers)
    const sliderMin = allIntegers ? 1 : Math.max(sliderStep, Number((sliderStep / 2).toPrecision(3)))
    const sliderMax = Math.max(defaultWidth * 4, niceStep(range > 0 ? range : defaultWidth * 4, allIntegers))

    return { min, max, range, allIntegers, defaultWidth, sliderStep, sliderMin, sliderMax }
  }, [values])

  if (!col || values.length === 0) {
    return <EmptyState icon="📊" title="Drop a numeric variable" description="Drag a numeric variable to the horizontal axis to build a histogram." />
  }

  return (
    <HistogramInner
      key={`${colId}-${groupColId ?? 'nogroup'}-${orientation}`}
      col={col}
      groupCol={groupCol ?? null}
      grid={grid}
      values={values}
      stats={stats}
      orientation={orientation}
      hideAxisTitles={hideAxisTitles}
    />
  )
}

interface HistogramInnerProps {
  col: NonNullable<ReturnType<typeof useStore.getState>['grid']['columns'][number] | undefined>
  groupCol: ReturnType<typeof useStore.getState>['grid']['columns'][number] | null
  grid: ReturnType<typeof useStore.getState>['grid']
  values: number[]
  stats: HistogramStats
  orientation: 'h' | 'v'
  hideAxisTitles: boolean
}

function HistogramInner({ col, groupCol, grid, values, stats, orientation, hideAxisTitles }: HistogramInnerProps) {
  const [showNormal, setShowNormal] = useState(false)
  const [binWidth, setBinWidth] = useState(stats.defaultWidth)
  const [binWidthInput, setBinWidthInput] = useState(formatBinWidth(stats.defaultWidth))
  let traces: Data[]

  const vert = orientation === 'v'
  const binKey = vert ? 'y' : 'x'
  const binSpecKey = vert ? 'ybins' : 'xbins'
  const rangeEnd = stats.range > 0 ? stats.max + binWidth : stats.min + binWidth
  const binSpec = {
    start: stats.min,
    end: rangeEnd,
    size: binWidth,
  }

  if (groupCol) {
    const groups = getStringValues(grid, groupCol.id)
    const uniqueGroups = [...new Set(groups)].filter(Boolean)
    traces = uniqueGroups.map((group, i) => ({
      type: 'histogram',
      name: group,
      [binKey]: values.filter((_, idx) => groups[idx] === group),
      [binSpecKey]: binSpec,
      marker: { color: ABRA_COLORS[i % ABRA_COLORS.length], opacity: 0.85, line: { color: 'white', width: 0.5 } },
      hovertemplate: vert
        ? `${group} — Range: %{y}<br>Count: %{x}<extra></extra>`
        : `${group} — Range: %{x}<br>Count: %{y}<extra></extra>`,
    }))
  } else {
    traces = [{
      type: 'histogram',
      name: col.name,
      [binKey]: values,
      [binSpecKey]: binSpec,
      marker: { color: ABRA_COLORS[0], opacity: 0.85, line: { color: 'white', width: 0.5 } },
      hovertemplate: vert ? 'Range: %{y}<br>Count: %{x}<extra></extra>' : 'Range: %{x}<br>Count: %{y}<extra></extra>',
    }]

    if (!vert && showNormal && values.length > 1) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
      const xMin = Math.min(...values) - std
      const xMax = Math.max(...values) + std
      const xs = Array.from({ length: 100 }, (_, i) => xMin + (i / 99) * (xMax - xMin))
      const pdf = xs.map(x => (values.length * binWidth) * (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2))
      traces.push({ type: 'scatter', mode: 'lines', name: 'Normal curve', x: xs, y: pdf, line: { color: '#EF4444', width: 2 }, hoverinfo: 'skip' })
    }
  }

  function applyBinWidth(next: number) {
    const clamped = Math.min(stats.sliderMax, Math.max(stats.sliderMin, next))
    setBinWidth(clamped)
    setBinWidthInput(formatBinWidth(clamped))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-4 px-4 pt-2">
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <span>Bin width</span>
          <input
            type="number"
            min={stats.sliderMin}
            max={stats.sliderMax}
            step={stats.sliderStep}
            value={binWidthInput}
            onChange={e => setBinWidthInput(e.target.value)}
            onBlur={() => {
              const parsed = Number(binWidthInput)
              if (Number.isFinite(parsed) && parsed > 0) {
                applyBinWidth(parsed)
              } else {
                setBinWidthInput(formatBinWidth(binWidth))
              }
            }}
            className="w-24 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)]"
          />
          <input
            type="range"
            min={stats.sliderMin}
            max={stats.sliderMax}
            step={stats.sliderStep}
            value={binWidth}
            onChange={e => applyBinWidth(Number(e.target.value))}
            className="w-36 accent-[var(--color-accent)]"
          />
        </label>
        {!groupCol && !vert && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer">
            <input type="checkbox" checked={showNormal} onChange={e => setShowNormal(e.target.checked)} className="accent-[var(--color-accent)]" />
            Normal curve
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            barmode: groupCol ? 'overlay' : 'relative',
            xaxis: { title: hideAxisTitles ? undefined : { text: vert ? 'Frequency' : col.name } },
            yaxis: { title: hideAxisTitles ? undefined : { text: vert ? col.name : 'Frequency' } },
            showlegend: !!groupCol,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Distribution of ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
        />
      </div>
    </div>
  )
}
