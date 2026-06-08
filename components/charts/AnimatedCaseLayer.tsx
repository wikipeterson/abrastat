'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { renderSvgMarkupToPngBlob } from '@/lib/exportDomAsPng'
import { areBrushRowsEqual, effectiveBrushRows, unionBrushRows } from '@/lib/linkedBrush'
import { useStore } from '@/lib/store'
import { linearRegression } from '@/lib/statistics'
import { sortCategoryValues } from '@/lib/categoryOrder'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MorphSpec =
  | { kind: 'blank' }
  | {
      kind: 'dot'
      valueColId: string
      valueColName?: string
      orientation: 'h' | 'v'
      groupColId?: string | null
      groupColName?: string | null
    }
  | {
      kind: 'scatter'
      xColId: string
      yColId: string
      xColName?: string
      yColName?: string
      colorByColId?: string | null
    }

export interface AnimatedCaseLayerProps {
  spec: MorphSpec
  fromSpec?: MorphSpec | null
  onRest?: () => void
  showHint?: boolean
  showBestFitLine?: boolean
  hideAxisTitles?: boolean
  colors?: string[]
  dotSize?: 'small' | 'medium' | 'large'
}

interface LayoutPoint {
  id: string
  rowIndex: number
  x: number
  y: number
  opacity: number
  color: string
}

interface IndexedRow {
  rowIndex: number
  row: Record<string, string | number>
}

interface GroupLabel {
  key: string
  label: string
  y: number
  color: string
}

interface LegendItem {
  key: string
  label: string
  color: string
}

interface TickMark {
  px: number
  label: string
}

interface AxisInfo {
  ticks: TickMark[]
  title: string
}

interface LayoutResult {
  points: LayoutPoint[]
  labels: GroupLabel[]
  legend?: LegendItem[]
  xAxis?: AxisInfo
  yAxis?: AxisInfo
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#49c7c0', '#f5b13d', '#5e84e2', '#ef7f88', '#9b8ce3', '#5db973']
const DURATION_MS = 420
const MG_L = 52
const MG_R = 24
const MG_T = 16
const MG_B = 48
const POINT_R = 5
const AXIS_CLEARANCE = 10
const LEGEND_GUTTER_W = 112

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000000) / 1000000
}

function parseNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

function hasAnyData(row: Record<string, string | number>): boolean {
  return Object.values(row).some(v => String(v ?? '').trim() !== '')
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function dataDomain(values: number[]): { min: number; max: number } {
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  return mn === mx ? { min: mn - 1, max: mx + 1 } : { min: mn, max: mx }
}

function niceAxisTicks(
  min: number,
  max: number,
  pxOf: (v: number) => number,
  targetCount = 5,
): TickMark[] {
  if (min >= max) return []
  const range = max - min
  const rawStep = range / targetCount
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step =
    [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rawStep) ?? rawStep
  const start = Math.ceil(min / step) * step
  const ticks: TickMark[] = []
  for (let v = start; v <= max + step * 1e-9; v += step) {
    const rv = parseFloat(v.toPrecision(10))
    if (rv < min || rv > max) continue
    const label = Number.isInteger(rv)
      ? String(rv)
      : String(parseFloat(rv.toPrecision(4)))
    ticks.push({ px: pxOf(rv), label })
  }
  return ticks
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function pointRadiusFor(dotSize: 'small' | 'medium' | 'large') {
  return dotSize === 'small' ? 3 : dotSize === 'large' ? 6 : 5
}

// ── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(
  spec: MorphSpec,
  rows: IndexedRow[],
  width: number,
  height: number,
  colors: string[] = COLORS,
): LayoutResult {
  const legendReserve = spec.kind === 'scatter' && spec.colorByColId ? LEGEND_GUTTER_W : 0
  const iL = MG_L
  const iR = width - MG_R - legendReserve
  const iT = MG_T
  const iB = height - MG_B
  const cW = Math.max(1, iR - iL)
  const cH = Math.max(1, iB - iT)
  const pL = iL + AXIS_CLEARANCE
  const pR = iR - POINT_R
  const pT = iT + POINT_R
  const pB = iB - AXIS_CLEARANCE
  const pW = Math.max(1, pR - pL)
  const pH = Math.max(1, pB - pT)

  // ── Blank ──────────────────────────────────────────────────────────────────
  if (spec.kind === 'blank') {
    return {
      points: rows.map(({ rowIndex }) => ({
        id: `row-${rowIndex}`,
        rowIndex,
        x: pL + hashUnit(`x-${rowIndex}`) * pW,
        y: pT + hashUnit(`y-${rowIndex}`) * pH,
        opacity: 0.72,
        color: '#7ccfc9',
      })),
      labels: [],
    }
  }

  // ── Scatter ────────────────────────────────────────────────────────────────
  if (spec.kind === 'scatter') {
    type RawPt = { id: string; x: number; y: number; group: string }
    const plotted: RawPt[] = []
    for (let i = 0; i < rows.length; i++) {
      const { rowIndex, row } = rows[i]
      const x = parseNumber(row[spec.xColId])
      const y = parseNumber(row[spec.yColId])
      if (x === null || y === null) continue
      const group = spec.colorByColId
        ? String(row[spec.colorByColId] ?? '').trim()
        : '__all__'
      if (spec.colorByColId && group === '') continue
      plotted.push({ id: `row-${rowIndex}`, x, y, group })
    }
    if (plotted.length === 0) return { points: [], labels: [] }

    const uniqueGroups = sortCategoryValues([...new Set(plotted.map(p => p.group))])
    const colorMap = new Map(uniqueGroups.map((g, i) => [g, colors[i % colors.length]]))
    const xDom = dataDomain(plotted.map(p => p.x))
    const yDom = dataDomain(plotted.map(p => p.y))
    const toPixX = (v: number) => pL + ((v - xDom.min) / (xDom.max - xDom.min)) * pW
    const toPixY = (v: number) => pB - ((v - yDom.min) / (yDom.max - yDom.min)) * pH

    return {
      points: plotted.map(p => ({
        id: p.id,
        rowIndex: Number(p.id.slice(4)),
        x: toPixX(p.x),
        y: toPixY(p.y),
        opacity: 0.85,
        color: colorMap.get(p.group) ?? colors[0],
      })),
      labels: [],
      legend: spec.colorByColId
        ? uniqueGroups.map((g, i) => ({ key: g, label: g, color: colors[i % colors.length] }))
        : undefined,
      xAxis: {
        ticks: niceAxisTicks(xDom.min, xDom.max, toPixX),
        title: spec.xColName ?? '',
      },
      yAxis: {
        ticks: niceAxisTicks(yDom.min, yDom.max, toPixY),
        title: spec.yColName ?? '',
      },
    }
  }

  // ── Dot plot ───────────────────────────────────────────────────────────────
  const grouped = new Map<string, { id: string; value: number }[]>()
  for (let i = 0; i < rows.length; i++) {
    const { rowIndex, row } = rows[i]
    const value = parseNumber(row[spec.valueColId])
    if (value === null) continue
    const rawGroup = spec.groupColId
      ? String(row[spec.groupColId] ?? '').trim()
      : ''
    if (spec.groupColId && rawGroup === '') continue
    const key = spec.groupColId ? rawGroup : '__all__'
    const arr = grouped.get(key) ?? []
    arr.push({ id: `row-${rowIndex}`, value })
    grouped.set(key, arr)
  }

  const groupKeys = [...grouped.keys()]
  if (groupKeys.length === 0) return { points: [], labels: [] }

  const allValues = groupKeys.flatMap(k => grouped.get(k)!.map(p => p.value))
  const vDom = dataDomain(allValues)
  const labels: GroupLabel[] = []
  const points: LayoutPoint[] = []
  const bandCount = groupKeys.length
  const bandSize = cH / bandCount
  const binCount = Math.max(12, Math.floor(cW / 18))

  const toPixVal =
    spec.orientation === 'h'
      ? (v: number) => pL + ((v - vDom.min) / (vDom.max - vDom.min)) * pW
      : (v: number) => pB - ((v - vDom.min) / (vDom.max - vDom.min)) * pH

  // Pre-pass: find the tallest bin across all groups so we can scale dotGap
  // to ensure no stack overflows its band height.
  let globalMaxStack = 1
  for (const groupKey of groupKeys) {
    const items = grouped.get(groupKey) ?? []
    const bins = new Map<number, number>()
    for (const item of items) {
      const ratio = clamp((item.value - vDom.min) / (vDom.max - vDom.min), 0, 1)
      const bin = Math.round(ratio * binCount)
      const s = (bins.get(bin) ?? 0) + 1
      bins.set(bin, s)
      if (s > globalMaxStack) globalMaxStack = s
    }
  }

  // Available stacking distance per band (h = up from baseline; v = right from axis)
  const bandStackSpace =
    spec.orientation === 'h'
      ? (bandSize - 22 - POINT_R)      // keep dots off the baseline/top edge
      : (pW - 18)                      // horizontal stacking space for vertical orientation
  const DOT_GAP_MAX = 9
  const dotGap = Math.min(DOT_GAP_MAX, Math.max(2, bandStackSpace / (globalMaxStack + 1)))

  groupKeys.forEach((groupKey, gi) => {
    const color = colors[gi % colors.length]
    const items = grouped.get(groupKey) ?? []
    const bins = new Map<number, number>()
    const bandBottom = iT + bandSize * (gi + 1) - (10 + POINT_R)
    const bandTop    = iT + bandSize * gi + (12 + POINT_R)
    const bandMid    = iT + bandSize * (gi + 0.5)

    if (spec.groupColId) {
      labels.push({ key: groupKey, label: groupKey, y: bandMid, color })
    }

    items
      .slice()
      .sort((a, b) => a.value - b.value)
      .forEach(item => {
        const ratio = clamp(
          (item.value - vDom.min) / (vDom.max - vDom.min),
          0,
          1,
        )
        const bin = Math.round(ratio * binCount)
        const stack = bins.get(bin) ?? 0
        bins.set(bin, stack + 1)

        // Use the bin's canonical position (not raw ratio) so all dots in the
        // same stack share an exact x (horizontal) or y (vertical) coordinate.
        const binRatio = bin / binCount

        if (spec.orientation === 'h') {
          const x = pL + binRatio * pW
          const yBase = spec.groupColId ? bandBottom : pB
          const y = Math.max(
            spec.groupColId ? bandTop : pT,
            yBase - stack * dotGap,
          )
          points.push({ id: item.id, rowIndex: Number(item.id.slice(4)), x, y, opacity: 0.92, color })
        } else {
          const y = pB - binRatio * pH
          const xBase = spec.groupColId ? pL + 13 + gi * 14 : pL + 11
          const x = Math.min(pR, xBase + stack * dotGap)
          points.push({ id: item.id, rowIndex: Number(item.id.slice(4)), x, y, opacity: 0.92, color })
        }
      })
  })

  return {
    points,
    labels,
    xAxis:
      spec.orientation === 'h'
        ? { ticks: niceAxisTicks(vDom.min, vDom.max, toPixVal), title: spec.valueColName ?? '' }
        : undefined,
    yAxis:
      spec.orientation === 'v'
        ? { ticks: niceAxisTicks(vDom.min, vDom.max, toPixVal), title: spec.valueColName ?? '' }
        : undefined,
  }
}

function computeScatterBestFitLine(
  spec: MorphSpec,
  rows: IndexedRow[],
  width: number,
  height: number,
) {
  if (spec.kind !== 'scatter' || width <= 0 || height <= 0) return null

  const plotted = rows.flatMap(({ row }) => {
    const x = parseNumber(row[spec.xColId])
    const y = parseNumber(row[spec.yColId])
    if (x === null || y === null) return [] as { x: number; y: number }[]
    return [{ x, y }]
  })
  if (plotted.length < 2) return null

  const xs = plotted.map(p => p.x)
  const ys = plotted.map(p => p.y)
  const { slope, intercept } = linearRegression(xs, ys)
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null

  const xDom = dataDomain(xs)
  const yDom = dataDomain(ys)
  const iL = MG_L
  const iR = width - MG_R
  const iT = MG_T
  const iB = height - MG_B
  const pL = iL + AXIS_CLEARANCE
  const pR = iR - POINT_R
  const pT = iT + POINT_R
  const pB = iB - AXIS_CLEARANCE
  const pW = Math.max(1, pR - pL)
  const pH = Math.max(1, pB - pT)
  const toPixX = (v: number) => pL + ((v - xDom.min) / (xDom.max - xDom.min)) * pW
  const toPixY = (v: number) => pB - ((v - yDom.min) / (yDom.max - yDom.min)) * pH

  const x1 = xDom.min
  const x2 = xDom.max
  return {
    x1: toPixX(x1),
    y1: toPixY(slope * x1 + intercept),
    x2: toPixX(x2),
    y2: toPixY(slope * x2 + intercept),
  }
}

export async function renderAnimatedGraphToPngBlob(options: {
  spec: MorphSpec
  rows: Record<string, string | number>[]
  width: number
  height: number
  title?: string
  xLabel?: string
  yLabel?: string
  showBestFitLine?: boolean
  colors?: string[]
  dotSize?: 'small' | 'medium' | 'large'
}) {
  const rows = options.rows.flatMap((row, rowIndex) => (
    hasAnyData(row) ? [{ rowIndex, row }] : [] as IndexedRow[]
  ))
  const plotWidth = Math.max(1, Math.ceil(options.width))
  const plotHeight = Math.max(1, Math.ceil(options.height))
  const title = options.title?.trim() ?? ''
  const xLabel = options.xLabel?.trim() ?? ''
  const yLabel = options.yLabel?.trim() ?? ''
  const leftPad = yLabel ? 42 : 0
  const bottomPad = xLabel ? 28 : 0
  const titleHeight = title ? 34 : 0
  const totalWidth = plotWidth + leftPad
  const totalHeight = plotHeight + titleHeight + bottomPad
  const pointRadius = pointRadiusFor(options.dotSize ?? 'medium')
  const layout = buildLayout(options.spec, rows, plotWidth, plotHeight, options.colors)
  const bestFitLine = options.showBestFitLine
    ? computeScatterBestFitLine(options.spec, rows, plotWidth, plotHeight)
    : null

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff" />
      ${title ? `<text x="${totalWidth / 2}" y="22" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="16" font-weight="600" fill="#0D4F49">${escapeSvgText(title)}</text>` : ''}
      <g transform="translate(${leftPad}, ${titleHeight})">
        ${bestFitLine ? `<line x1="${bestFitLine.x1}" y1="${bestFitLine.y1}" x2="${bestFitLine.x2}" y2="${bestFitLine.y2}" stroke="#EF4444" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round" />` : ''}
        ${layout.xAxis ? `
          <line x1="${MG_L}" y1="${plotHeight - MG_B}" x2="${plotWidth - MG_R}" y2="${plotHeight - MG_B}" stroke="#E2E8F0" stroke-width="1.5" />
          ${layout.xAxis.ticks.map(t => `
            <g transform="translate(${t.px},${plotHeight - MG_B})">
              <line y2="4" stroke="#CBD5E1" stroke-width="1" />
              <text y="14" text-anchor="middle" font-size="10" fill="#64748B" font-family="DM Sans, sans-serif">${escapeSvgText(t.label)}</text>
            </g>
          `).join('')}
        ` : ''}
        ${layout.yAxis ? `
          <line x1="${MG_L}" y1="${MG_T}" x2="${MG_L}" y2="${plotHeight - MG_B}" stroke="#E2E8F0" stroke-width="1.5" />
          ${layout.yAxis.ticks.map(t => `
            <g transform="translate(${MG_L},${t.px})">
              <line x2="-4" stroke="#CBD5E1" stroke-width="1" />
              <text x="-8" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#64748B" font-family="DM Sans, sans-serif">${escapeSvgText(t.label)}</text>
            </g>
          `).join('')}
        ` : ''}
        ${layout.labels.map(label => `
          <text x="${plotWidth - 24}" y="${label.y}" text-anchor="end" dominant-baseline="middle" font-size="12" font-weight="600" fill="${label.color}" opacity="0.9" font-family="DM Sans, sans-serif">${escapeSvgText(label.label)}</text>
        `).join('')}
        ${layout.legend?.map((item, index) => `
          <g transform="translate(${plotWidth - MG_R + 4},${MG_T + 10 + index * 14})">
            <circle cx="4" cy="0" r="${Math.max(3, pointRadius - 1)}" fill="${item.color}" />
            <text x="12" y="0" dominant-baseline="middle" font-size="10" font-weight="500" fill="${item.color}" font-family="DM Sans, sans-serif">${escapeSvgText(item.label)}</text>
          </g>
        `).join('') ?? ''}
        ${layout.points.map(point => `
          <circle cx="${point.x}" cy="${point.y}" r="${pointRadius}" fill="${point.color}" fill-opacity="${point.opacity}" />
        `).join('')}
      </g>
      ${xLabel ? `<text x="${leftPad + plotWidth / 2}" y="${titleHeight + plotHeight + 22}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B">${escapeSvgText(xLabel)}</text>` : ''}
      ${yLabel ? `<text x="16" y="${titleHeight + plotHeight / 2}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B" transform="rotate(-90 16 ${titleHeight + plotHeight / 2})">${escapeSvgText(yLabel)}</text>` : ''}
    </svg>
  `

  return renderSvgMarkupToPngBlob(svg, totalWidth, totalHeight)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnimatedCaseLayer({
  spec,
  fromSpec,
  onRest,
  showHint = false,
  showBestFitLine = false,
  hideAxisTitles = false,
  colors = COLORS,
  dotSize = 'medium',
}: AnimatedCaseLayerProps) {
  const { grid } = useStore()
  const hoveredBrush = useStore(state => state.brush.hovered)
  const pinnedBrush = useStore(state => state.brush.pinned)
  const setBrushHover = useStore(state => state.setBrushHover)
  const setBrushPinned = useStore(state => state.setBrushPinned)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hoverFrameRef = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [animating, setAnimating] = useState(false)
  const [phase, setPhase] = useState<'from' | 'to'>(fromSpec ? 'from' : 'to')
  const pointRadius = pointRadiusFor(dotSize)

  const rows = useMemo(
    () =>
      grid.rows.flatMap((row, rowIndex) => (
        hasAnyData(row) ? [{ rowIndex, row }] : [] as IndexedRow[]
      )),
    [grid.rows],
  )
  const effectiveBrushSet = useMemo(
    () => new Set(effectiveBrushRows(hoveredBrush, pinnedBrush)),
    [hoveredBrush, pinnedBrush],
  )

  function scheduleHoverRows(nextRows: number[]) {
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current)
    }
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null
      const normalized = [...new Set(nextRows)].sort((a, b) => a - b)
      if (!areBrushRowsEqual(normalized, hoveredBrush)) {
        setBrushHover(normalized)
      }
    })
  }

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({ width: rect.width, height: rect.height })
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current)
      }
    }
  }, [])

  const fromLayout = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? buildLayout(fromSpec ?? spec, rows, size.width, size.height, colors)
        : { points: [], labels: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromSpec, spec, rows, size.width, size.height, colors],
  )

  const toLayout = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? buildLayout(spec, rows, size.width, size.height, colors)
        : { points: [], labels: [] },
    [spec, rows, size.width, size.height, colors],
  )

  const displayPoints = useMemo(() => {
    const map = new Map<string, { from?: LayoutPoint; to?: LayoutPoint }>()
    fromLayout.points.forEach(p => map.set(p.id, { from: p }))
    toLayout.points.forEach(p => {
      const entry = map.get(p.id) ?? {}
      entry.to = p
      map.set(p.id, entry)
    })
    const src = phase === 'from' ? 'from' : 'to'
    const alt = phase === 'from' ? 'to' : 'from'
    return [...map.entries()].map(([id, entry]) => {
      const primary   = entry[src]
      const secondary = entry[alt]
      if (primary) return primary
      return { ...(secondary as LayoutPoint), id, opacity: 0 }
    })
  }, [fromLayout.points, phase, toLayout.points])

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    if (!fromSpec) return
    const raf = requestAnimationFrame(() => {
      setAnimating(true)
      setPhase('to')
    })
    const timer = window.setTimeout(() => {
      setAnimating(false)
      onRest?.()
    }, DURATION_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [fromSpec, onRest, size.height, size.width, spec])

  const showAxes = spec.kind !== 'blank'
  const { xAxis, yAxis, legend } = toLayout
  const bestFitLine = useMemo(
    () => (showBestFitLine ? computeScatterBestFitLine(spec, rows, size.width, size.height) : null),
    [rows, showBestFitLine, size.height, size.width, spec],
  )

  if (rows.length === 0) {
    return (
      <div
        ref={wrapRef}
        className="h-full flex flex-col items-center justify-center gap-2 text-center p-6"
      >
        <span className="text-4xl opacity-25 select-none">📈</span>
        <p className="text-sm font-medium text-[var(--color-muted)]">
          Drop a variable to get started
        </p>
        <p className="text-xs text-[var(--color-muted)] opacity-70">
          Drag and drop a variable from the sidebar to begin.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full overflow-hidden rounded-xl"
      onMouseLeave={() => scheduleHoverRows([])}
    >
      {showHint && spec.kind === 'blank' && (
        <div className="absolute inset-x-0 bottom-5 text-center pointer-events-none">
          <p className="text-sm font-medium text-[var(--color-muted)]">
            Drop a variable to organize the data
          </p>
        </div>
      )}

      {/* ── Axes SVG ── */}
      {showAxes && size.width > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.width}
          height={size.height}
        >
          {bestFitLine && (
            <line
              x1={bestFitLine.x1}
              y1={bestFitLine.y1}
              x2={bestFitLine.x2}
              y2={bestFitLine.y2}
              stroke="#EF4444"
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          )}
          {xAxis && (
            <g>
              <line
                x1={MG_L}
                y1={size.height - MG_B}
                x2={size.width - MG_R}
                y2={size.height - MG_B}
                stroke="#E2E8F0"
                strokeWidth={1.5}
              />
              {xAxis.ticks.map(t => (
                <g key={t.label} transform={`translate(${t.px},${size.height - MG_B})`}>
                  <line y2={4} stroke="#CBD5E1" strokeWidth={1} />
                  <text
                    y={14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#64748B"
                    fontFamily="DM Sans, sans-serif"
                  >
                    {t.label}
                  </text>
                </g>
              ))}
              {!hideAxisTitles && xAxis.title && (
                <text
                  x={(MG_L + size.width - MG_R) / 2}
                  y={size.height - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#94A3B8"
                  fontFamily="DM Sans, sans-serif"
                >
                  {xAxis.title}
                </text>
              )}
            </g>
          )}

          {yAxis && (
            <g>
              <line
                x1={MG_L}
                y1={MG_T}
                x2={MG_L}
                y2={size.height - MG_B}
                stroke="#E2E8F0"
                strokeWidth={1.5}
              />
              {yAxis.ticks.map(t => (
                <g key={t.label} transform={`translate(${MG_L},${t.px})`}>
                  <line x2={-4} stroke="#CBD5E1" strokeWidth={1} />
                  <text
                    x={-8}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="#64748B"
                    fontFamily="DM Sans, sans-serif"
                  >
                    {t.label}
                  </text>
                </g>
              ))}
              {!hideAxisTitles && yAxis.title && (
                <text
                  transform={`translate(13,${(MG_T + size.height - MG_B) / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#94A3B8"
                  fontFamily="DM Sans, sans-serif"
                >
                  {yAxis.title}
                </text>
              )}
            </g>
          )}
        </svg>
      )}

      {/* ── Dot-plot group labels ── */}
      {toLayout.labels.map(label => (
        <div
          key={label.key}
          className="absolute right-6 text-xs font-semibold pointer-events-none"
          style={{
            top: `${label.y}px`,
            transform: 'translateY(-50%)',
            color: label.color,
            opacity: spec.kind === 'dot' && spec.groupColId ? 0.9 : 0,
            transition: `opacity ${DURATION_MS}ms ease`,
          }}
        >
          {label.label}
        </div>
      ))}

      {/* ── Scatter color legend ── */}
      {legend && legend.length > 0 && (
        <div
          className="absolute pointer-events-none flex flex-col gap-0.5"
          style={{
            top: MG_T + 4,
            left: size.width - MG_R - LEGEND_GUTTER_W + 8,
            width: LEGEND_GUTTER_W - 12,
          }}
        >
          {legend.map(item => (
            <div key={item.key} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: item.color }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Dots ── */}
      {displayPoints.map(point => (
        <div
          key={point.id}
          className="absolute rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
          onMouseEnter={() => scheduleHoverRows([point.rowIndex])}
          onMouseLeave={() => scheduleHoverRows([])}
          onClick={() => {
            setBrushPinned(unionBrushRows(pinnedBrush, [point.rowIndex]))
          }}
          style={{
            width: pointRadius * 2,
            height: pointRadius * 2,
            left: `${point.x}px`,
            top: `${point.y}px`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: point.color,
            opacity:
              effectiveBrushSet.size === 0
                ? point.opacity
                : effectiveBrushSet.has(point.rowIndex)
                  ? 1
                  : Math.max(0.08, point.opacity * 0.12),
            zIndex: effectiveBrushSet.has(point.rowIndex) ? 2 : 1,
            boxShadow: effectiveBrushSet.has(point.rowIndex)
              ? '0 0 0 2px rgba(255,255,255,0.92), 0 0 0 4px rgba(22,168,155,0.2)'
              : undefined,
            cursor: 'pointer',
            transition: animating
              ? `left ${DURATION_MS}ms cubic-bezier(0.22,1,0.36,1), top ${DURATION_MS}ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease, box-shadow 160ms ease`
              : 'opacity 120ms ease, box-shadow 120ms ease',
          }}
        />
      ))}
    </div>
  )
}

// ── Spec derivation ───────────────────────────────────────────────────────────

export function deriveGraphMorphSpec(args: {
  currentChart: string | null
  xColId: string | null
  yColId: string | null
  groupColId: string | null
  xType: 'numeric' | 'categorical' | null
  yType: 'numeric' | 'categorical' | null
  groupType: 'numeric' | 'categorical' | null
  orientation: 'h' | 'v'
  xColName?: string
  yColName?: string
  groupColName?: string
}): MorphSpec | null {
  const {
    currentChart, xColId, yColId, groupColId,
    xType, yType, groupType, orientation,
    xColName, yColName, groupColName,
  } = args

  if (!currentChart) return { kind: 'blank' }

  if (
    currentChart === 'scatter' &&
    xColId && yColId &&
    xType === 'numeric' && yType === 'numeric'
  ) {
    return {
      kind: 'scatter',
      xColId,
      yColId,
      xColName,
      yColName,
      colorByColId: groupType === 'categorical' ? groupColId : null,
    }
  }

  if (currentChart !== 'dot') return null

  if (yColId && !xColId && yType === 'numeric') {
    return {
      kind: 'dot',
      valueColId: yColId,
      valueColName: yColName,
      orientation: 'v',
      groupColId: groupType === 'categorical' ? groupColId : null,
      groupColName,
    }
  }

  if (xType === 'categorical' && yType === 'numeric' && yColId) {
    return {
      kind: 'dot',
      valueColId: yColId,
      valueColName: yColName,
      orientation: 'h',
      groupColId: xColId,
      groupColName: xColName,
    }
  }

  if (xType === 'numeric' && yType === 'categorical' && xColId) {
    return {
      kind: 'dot',
      valueColId: xColId,
      valueColName: xColName,
      orientation: 'h',
      groupColId: yColId,
      groupColName: yColName,
    }
  }

  const mainColId   = orientation === 'h' ? xColId   : yColId
  const mainType    = orientation === 'h' ? xType    : yType
  const mainColName = orientation === 'h' ? xColName : yColName

  if (mainColId && mainType === 'numeric') {
    return {
      kind: 'dot',
      valueColId: mainColId,
      valueColName: mainColName,
      orientation,
      groupColId: groupType === 'categorical' ? groupColId : null,
      groupColName,
    }
  }

  return null
}
