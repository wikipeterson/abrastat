'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

type MorphSpec =
  | { kind: 'blank' }
  | { kind: 'dot'; valueColId: string; orientation: 'h' | 'v'; groupColId?: string | null }
  | { kind: 'scatter'; xColId: string; yColId: string }

interface AnimatedCaseLayerProps {
  spec: MorphSpec
  fromSpec?: MorphSpec | null
  onRest?: () => void
  showHint?: boolean
}

interface LayoutPoint {
  id: string
  x: number
  y: number
  opacity: number
  color: string
}

interface GroupLabel {
  key: string
  label: string
  y: number
  color: string
}

const COLORS = ['#49c7c0', '#f5b13d', '#5e84e2', '#ef7f88', '#9b8ce3', '#5db973']
const DURATION_MS = 420

function hashUnit(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000000) / 1000000
}

function parseNumber(value: string | number | undefined) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

function hasAnyData(row: Record<string, string | number>) {
  return Object.values(row).some(value => String(value ?? '').trim() !== '')
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function domain(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
}

function buildLayout(
  spec: MorphSpec,
  rows: Record<string, string | number>[],
  width: number,
  height: number,
): { points: LayoutPoint[]; labels: GroupLabel[] } {
  const innerLeft = 24
  const innerRight = width - 24
  const innerTop = 20
  const innerBottom = height - 20
  const chartWidth = Math.max(1, innerRight - innerLeft)
  const chartHeight = Math.max(1, innerBottom - innerTop)

  if (spec.kind === 'blank') {
    const points = rows.map((_, index) => ({
      id: `row-${index}`,
      x: innerLeft + hashUnit(`x-${index}`) * chartWidth,
      y: innerTop + hashUnit(`y-${index}`) * chartHeight,
      opacity: 0.82,
      color: '#7ccfc9',
    }))
    return { points, labels: [] }
  }

  if (spec.kind === 'scatter') {
    const plotted = rows.flatMap((row, index) => {
      const x = parseNumber(row[spec.xColId])
      const y = parseNumber(row[spec.yColId])
      if (x === null || y === null) return []
      return [{ id: `row-${index}`, x, y }]
    })
    if (plotted.length === 0) return { points: [], labels: [] }
    const xDomain = domain(plotted.map(p => p.x))
    const yDomain = domain(plotted.map(p => p.y))
    return {
      points: plotted.map(p => ({
        id: p.id,
        x: innerLeft + ((p.x - xDomain.min) / (xDomain.max - xDomain.min)) * chartWidth,
        y: innerBottom - ((p.y - yDomain.min) / (yDomain.max - yDomain.min)) * chartHeight,
        opacity: 0.92,
        color: '#49c7c0',
      })),
      labels: [],
    }
  }

  const grouped = new Map<string, { id: string; value: number }[]>()
  rows.forEach((row, index) => {
    const value = parseNumber(row[spec.valueColId])
    if (value === null) return
    const rawGroup = spec.groupColId ? String(row[spec.groupColId] ?? '').trim() : ''
    if (spec.groupColId && rawGroup === '') return
    const key = spec.groupColId ? rawGroup : '__all__'
    const groupRows = grouped.get(key) ?? []
    groupRows.push({ id: `row-${index}`, value })
    grouped.set(key, groupRows)
  })

  const groupKeys = [...grouped.keys()]
  if (groupKeys.length === 0) return { points: [], labels: [] }

  const allValues = groupKeys.flatMap(key => grouped.get(key)!.map(p => p.value))
  const valueDomain = domain(allValues)
  const labels: GroupLabel[] = []
  const points: LayoutPoint[] = []
  const bandCount = groupKeys.length
  const bandSize = chartHeight / bandCount
  const dotSize = 10
  const dotGap = 6
  const axisSpan = chartWidth
  const binCount = Math.max(12, Math.floor(axisSpan / 18))

  groupKeys.forEach((groupKey, groupIndex) => {
    const color = COLORS[groupIndex % COLORS.length]
    const items = grouped.get(groupKey) ?? []
    const bins = new Map<number, number>()
    const bandBottom = innerTop + bandSize * (groupIndex + 1) - 10
    const bandTop = innerTop + bandSize * groupIndex + 12
    const bandMid = innerTop + bandSize * (groupIndex + 0.5)
    if (spec.groupColId) {
      labels.push({
        key: groupKey,
        label: groupKey,
        y: bandMid,
        color,
      })
    }

    items
      .slice()
      .sort((a, b) => a.value - b.value)
      .forEach(item => {
        const ratio = clamp((item.value - valueDomain.min) / (valueDomain.max - valueDomain.min), 0, 1)
        const bin = Math.round(ratio * binCount)
        const stack = bins.get(bin) ?? 0
        bins.set(bin, stack + 1)

        if (spec.orientation === 'h') {
          const x = innerLeft + ratio * chartWidth
          const yBase = spec.groupColId ? bandBottom : innerBottom - 10
          const y = Math.max(spec.groupColId ? bandTop : innerTop + 10, yBase - stack * dotGap)
          points.push({ id: item.id, x, y, opacity: 0.92, color })
        } else {
          const y = innerBottom - ratio * chartHeight
          const xBase = spec.groupColId ? innerLeft + 18 + groupIndex * 14 : innerLeft + 16
          const x = Math.min(innerRight - dotSize, xBase + stack * dotGap)
          points.push({ id: item.id, x, y, opacity: 0.92, color })
        }
      })
  })

  return { points, labels }
}

export function AnimatedCaseLayer({ spec, fromSpec, onRest, showHint = false }: AnimatedCaseLayerProps) {
  const { grid } = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [animating, setAnimating] = useState(false)
  const [phase, setPhase] = useState<'from' | 'to'>(fromSpec ? 'from' : 'to')

  const rows = useMemo(() => grid.rows.filter(hasAnyData), [grid.rows])

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const fromLayout = useMemo(
    () => (size.width > 0 && size.height > 0 ? buildLayout(fromSpec ?? spec, rows, size.width, size.height) : { points: [], labels: [] }),
    [fromSpec, spec, rows, size.width, size.height],
  )
  const toLayout = useMemo(
    () => (size.width > 0 && size.height > 0 ? buildLayout(spec, rows, size.width, size.height) : { points: [], labels: [] }),
    [spec, rows, size.width, size.height],
  )

  const displayPoints = useMemo(() => {
    const pointMap = new Map<string, { from?: LayoutPoint; to?: LayoutPoint }>()
    fromLayout.points.forEach(point => pointMap.set(point.id, { from: point }))
    toLayout.points.forEach(point => {
      const entry = pointMap.get(point.id) ?? {}
      entry.to = point
      pointMap.set(point.id, entry)
    })

    const source = phase === 'from' ? 'from' : 'to'
    const fallback = phase === 'from' ? 'to' : 'from'
    return [...pointMap.entries()].map(([id, entry]) => {
      const primary = entry[source]
      const secondary = entry[fallback]
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

  if (rows.length === 0) {
    return (
      <div ref={wrapRef} className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
        <span className="text-4xl opacity-25 select-none">📈</span>
        <p className="text-sm font-medium text-[var(--color-muted)]">Drop a variable to get started</p>
        <p className="text-xs text-[var(--color-muted)] opacity-70">Drag and drop a variable from the sidebar to begin.</p>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative h-full overflow-hidden rounded-xl">
      {showHint && spec.kind === 'blank' && (
        <div className="absolute inset-x-0 bottom-5 text-center pointer-events-none">
          <p className="text-sm font-medium text-[var(--color-muted)]">Drop a variable to organize the data</p>
        </div>
      )}

      {toLayout.labels.map(label => (
        <div
          key={label.key}
          className="absolute right-6 text-sm font-semibold pointer-events-none"
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

      {displayPoints.map(point => (
        <div
          key={point.id}
          className="absolute rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
          style={{
            width: 10,
            height: 10,
            left: `${point.x}px`,
            top: `${point.y}px`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: point.color,
            opacity: point.opacity,
            transition: animating
              ? `left ${DURATION_MS}ms cubic-bezier(0.22,1,0.36,1), top ${DURATION_MS}ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease`
              : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function deriveGraphMorphSpec(args: {
  currentChart: string | null
  xColId: string | null
  yColId: string | null
  groupColId: string | null
  xType: 'numeric' | 'categorical' | null
  yType: 'numeric' | 'categorical' | null
  groupType: 'numeric' | 'categorical' | null
  orientation: 'h' | 'v'
}): MorphSpec | null {
  const { currentChart, xColId, yColId, groupColId, xType, yType, groupType, orientation } = args

  if (!currentChart) return { kind: 'blank' }

  if (currentChart === 'scatter' && xColId && yColId && xType === 'numeric' && yType === 'numeric') {
    return { kind: 'scatter', xColId, yColId }
  }

  if (currentChart !== 'dot') return null

  if (yColId && !xColId && yType === 'numeric') {
    return { kind: 'dot', valueColId: yColId, orientation: 'v', groupColId: groupType === 'categorical' ? groupColId : null }
  }

  if (xType === 'categorical' && yType === 'numeric' && yColId) {
    return { kind: 'dot', valueColId: yColId, orientation: 'h', groupColId: xColId }
  }

  if (xType === 'numeric' && yType === 'categorical' && xColId) {
    return { kind: 'dot', valueColId: xColId, orientation: 'h', groupColId: yColId }
  }

  const mainColId = orientation === 'h' ? xColId : yColId
  const mainType = orientation === 'h' ? xType : yType
  if (mainColId && mainType === 'numeric') {
    return { kind: 'dot', valueColId: mainColId, orientation, groupColId: groupType === 'categorical' ? groupColId : null }
  }

  return null
}
