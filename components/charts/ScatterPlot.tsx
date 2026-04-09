'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import type { Data, Annotations } from 'plotly.js'
import { useStore } from '@/lib/store'
import { linearRegression } from '@/lib/statistics'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'

interface ScatterPlotProps {
  xColId: string | null
  yColId: string | null
  colorByColId?: string | null
  bestFitMode?: 'none' | 'overall' | 'group'
}

interface ScatterPoint {
  x: number
  y: number
  group: string
  size: number | null
}

function useAnimatedY(targetY: number[], animate: boolean): number[] {
  const [displayY, setDisplayY] = useState<number[]>([])
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const DURATION = 2200 // ms

  useEffect(() => {
    if (!animate || targetY.length === 0) {
      setDisplayY(targetY)
      return
    }

    // Cancel any in-progress animation
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    startTimeRef.current = null

    function step(now: number) {
      if (startTimeRef.current === null) startTimeRef.current = now
      const elapsed = now - startTimeRef.current
      const t = Math.min(elapsed / DURATION, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayY(targetY.map(v => v * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, targetY.join(',')])

  return animate ? displayY : targetY
}

export function ScatterPlot({ xColId, yColId, colorByColId, bestFitMode = 'none' }: ScatterPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles, colors, dotSize, showMeans, xAxisRange, yAxisRange } = useGraphCardContext()
  const prevYColIdRef = useRef<string | null>(null)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  const xCol = grid.columns.find(c => c.id === xColId)
  const yCol = grid.columns.find(c => c.id === yColId)
  const groupCol = colorByColId ? (grid.columns.find(c => c.id === colorByColId) ?? null) : null
  const useBubbleSize = groupCol?.type === 'numeric'
  const useColorGroups = groupCol?.type === 'categorical'
  const markerSize = dotSize === 'small' ? 5 : dotSize === 'large' ? 10 : 7

  // Build complete-case points. When the third variable is categorical, use it
  // for color grouping. When it is numeric, use it for bubble size.
  const allPoints = useMemo(() => {
    if (!xColId || !yColId) return [] as ScatterPoint[]
    return grid.rows.flatMap<ScatterPoint>(r => {
      const rx = r[xColId], ry = r[yColId]
      if (rx === '' || rx == null || ry === '' || ry == null) return [] as ScatterPoint[]
      const x = Number(rx), y = Number(ry)
      if (!isFinite(x) || !isFinite(y)) return [] as ScatterPoint[]
      if (useColorGroups && colorByColId) {
        const group = String(r[colorByColId] ?? '').trim()
        if (!group) return [] as ScatterPoint[]
        return [{ x, y, group, size: null }]
      }
      if (useBubbleSize && colorByColId) {
        const rawSize = r[colorByColId]
        if (rawSize === '' || rawSize == null) return [] as ScatterPoint[]
        const size = Number(rawSize)
        if (!isFinite(size)) return [] as ScatterPoint[]
        return [{ x, y, group: '', size }]
      }
      return [{ x, y, group: '', size: null }]
    })
  }, [grid.rows, xColId, yColId, colorByColId, useBubbleSize, useColorGroups])

  const xValues = useMemo(() => allPoints.map(p => p.x), [allPoints])
  const rawYValues = useMemo(() => allPoints.map(p => p.y), [allPoints])
  const sizeValues = useMemo(() => allPoints.map(p => p.size).filter((v): v is number => v != null), [allPoints])

  // Detect transition from null → assigned yColId; defer setState to avoid synchronous call in effect
  useEffect(() => {
    if (yColId && prevYColIdRef.current === null) {
      const triggerTimer = window.setTimeout(() => setShouldAnimate(true), 0)
      const resetTimer = window.setTimeout(() => setShouldAnimate(false), 2300)
      prevYColIdRef.current = yColId
      return () => { clearTimeout(triggerTimer); clearTimeout(resetTimer) }
    }
    prevYColIdRef.current = yColId
  }, [yColId])

  const animatedY = useAnimatedY(rawYValues, shouldAnimate)

  if (!xColId || !yColId || !xCol || !yCol) {
    return <EmptyState icon="⚫" title="Select X and Y columns" description="Choose two numeric columns to build a scatter plot." />
  }

  const yValues = animatedY.length === rawYValues.length ? animatedY : rawYValues

  // Lock y-axis to its final range during animation so the axis doesn't rescale each frame
  const animatedYAxisRange = shouldAnimate && rawYValues.length > 0
    ? (() => {
        const yMin = Math.min(...rawYValues)
        const yMax = Math.max(...rawYValues)
        const pad = (yMax - yMin) * 0.1 || 1
        return [yMin - pad, yMax + pad]
      })()
    : undefined

  let traces: Data[]

  if (useColorGroups && colorByColId) {
    const uniqueGroups = sortCategoryValues([...new Set(allPoints.map(p => p.group))])
    traces = uniqueGroups.map((group, i) => ({
      type: 'scatter',
      mode: 'markers',
      name: group,
      x: allPoints.filter(p => p.group === group).map(p => p.x),
      y: allPoints.filter(p => p.group === group).map(p => p.y),
      marker: { color: colors[i % colors.length], size: markerSize, opacity: 0.85, line: { width: 0 } },
      hovertemplate: `${xCol.name}: %{x}<br>${yCol.name}: %{y}<extra>${group}</extra>`,
    }))
  } else if (useBubbleSize && groupCol) {
    const minSize = Math.min(...sizeValues)
    const maxSize = Math.max(...sizeValues)
    const scaledSizes = allPoints.map(p => {
      const value = p.size ?? minSize
      if (maxSize === minSize) return 24
      return 12 + ((value - minSize) / (maxSize - minSize)) * 44
    })
    traces = [{
      type: 'scatter',
      mode: 'markers',
      name: `${xCol.name} vs ${yCol.name}`,
      x: xValues,
      y: yValues,
      marker: {
        color: colors[0],
        size: scaledSizes.map(size => size * (markerSize / 7)),
        sizemode: 'diameter',
        opacity: 0.45,
        line: { width: 0 },
      },
      hovertemplate: `${xCol.name}: %{x}<br>${yCol.name}: %{y}<br>${groupCol.name}: %{customdata}<extra></extra>`,
      customdata: allPoints.map(p => p.size),
    }]
  } else {
    traces = [{
      type: 'scatter',
      mode: 'markers',
      name: `${xCol.name} vs ${yCol.name}`,
      x: xValues,
      y: yValues,
      marker: { color: colors[0], size: markerSize, opacity: 0.85, line: { width: 0 } },
      hovertemplate: `${xCol.name}: %{x}<br>${yCol.name}: %{y}<extra></extra>`,
    }]
  }

  let annotations: Partial<Annotations>[] = []
  const meanX = xValues.length > 0 ? xValues.reduce((sum, x) => sum + x, 0) / xValues.length : 0
  const meanY = rawYValues.length > 0 ? rawYValues.reduce((sum, y) => sum + y, 0) / rawYValues.length : 0
  const meanShapes = showMeans ? [
    {
      type: 'line' as const,
      x0: meanX,
      x1: meanX,
      y0: 0,
      y1: 1,
      yref: 'paper' as const,
      line: { color: '#8B5CF6', width: 1.5, dash: 'dot' as const },
    },
    {
      type: 'line' as const,
      x0: 0,
      x1: 1,
      xref: 'paper' as const,
      y0: meanY,
      y1: meanY,
      line: { color: '#8B5CF6', width: 1.5, dash: 'dot' as const },
    },
  ] : []
  if (bestFitMode === 'overall' && xValues.length >= 2) {
    const { slope, intercept, r } = linearRegression(xValues, rawYValues)
    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: `Best fit (r = ${r.toFixed(3)})`,
      x: [xMin, xMax],
      y: [slope * xMin + intercept, slope * xMax + intercept],
      line: { color: '#EF4444', width: 2, dash: 'dash' },
      hoverinfo: 'skip',
    })
    annotations = [{
      xref: 'paper', yref: 'paper',
      x: 0.02, y: 0.98,
      xanchor: 'left', yanchor: 'top',
      text: `ŷ = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}`,
      showarrow: false,
      font: { size: 12, color: '#EF4444' },
      bgcolor: 'rgba(255,255,255,0.8)',
      bordercolor: '#EF4444',
      borderwidth: 1,
      borderpad: 4,
    }]
  }

  if (bestFitMode === 'group' && useColorGroups && colorByColId) {
    const uniqueGroups = sortCategoryValues([...new Set(allPoints.map(p => p.group))])
    uniqueGroups.forEach((group, i) => {
      const pts = allPoints.filter(p => p.group === group)
      if (pts.length < 2) return
      const xs = pts.map(p => p.x)
      const ys = pts.map(p => p.y)
      const { slope, intercept } = linearRegression(xs, ys)
      const xMin = Math.min(...xs)
      const xMax = Math.max(...xs)
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: `${group} best fit`,
        x: [xMin, xMax],
        y: [slope * xMin + intercept, slope * xMax + intercept],
        line: { color: colors[i % colors.length], width: 2 },
        hovertemplate: `${group}<br>ŷ = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}<extra></extra>`,
      })
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            xaxis: { title: hideAxisTitles ? { text: '' } : { text: xCol.name }, ...(xAxisRange ? { range: xAxisRange } : {}) },
            yaxis: { title: hideAxisTitles ? { text: '' } : { text: yCol.name }, ...((yAxisRange ?? animatedYAxisRange) ? { range: (yAxisRange ?? animatedYAxisRange) } : {}) },
            showlegend: !!useColorGroups,
            annotations,
            shapes: meanShapes,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? '' : `${yCol.name} vs ${xCol.name}`}
        />
      </div>
    </div>
  )
}
