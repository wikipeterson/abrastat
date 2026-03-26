'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import type { Data, Annotations } from 'plotly.js'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { linearRegression } from '@/lib/statistics'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'

interface ScatterPlotProps {
  xColId: string | null
  yColId: string | null
  colorByColId?: string | null
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

export function ScatterPlot({ xColId, yColId, colorByColId }: ScatterPlotProps) {
  const { grid } = useStore()
  const [showBestFit, setShowBestFit] = useState(false)
  const prevYColIdRef = useRef<string | null>(null)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  const xCol = grid.columns.find(c => c.id === xColId)
  const yCol = grid.columns.find(c => c.id === yColId)

  const xValues = useMemo(() => xColId ? getNumericValues(grid, xColId) : [], [grid, xColId])
  const rawYValues = useMemo(() => yColId ? getNumericValues(grid, yColId) : [], [grid, yColId])

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
  const yAxisRange = shouldAnimate && rawYValues.length > 0
    ? (() => {
        const yMin = Math.min(...rawYValues)
        const yMax = Math.max(...rawYValues)
        const pad = (yMax - yMin) * 0.1 || 1
        return [yMin - pad, yMax + pad]
      })()
    : undefined

  let traces: Data[]

  if (colorByColId) {
    const groups = getStringValues(grid, colorByColId)
    const uniqueGroups = [...new Set(groups)].filter(Boolean)
    traces = uniqueGroups.map((group, i) => ({
      type: 'scatter',
      mode: 'markers',
      name: group,
      x: xValues.filter((_, idx) => groups[idx] === group),
      y: yValues.filter((_, idx) => groups[idx] === group),
      marker: { color: ABRA_COLORS[i % ABRA_COLORS.length], size: 7, opacity: 0.85, line: { width: 0 } },
      hovertemplate: `${xCol.name}: %{x}<br>${yCol.name}: %{y}<extra>${group}</extra>`,
    }))
  } else {
    traces = [{
      type: 'scatter',
      mode: 'markers',
      name: `${xCol.name} vs ${yCol.name}`,
      x: xValues,
      y: yValues,
      marker: { color: ABRA_COLORS[0], size: 7, opacity: 0.85, line: { width: 0 } },
      hovertemplate: `${xCol.name}: %{x}<br>${yCol.name}: %{y}<extra></extra>`,
    }]
  }

  let annotations: Partial<Annotations>[] = []
  if (showBestFit && xValues.length >= 2) {
    const { slope, intercept, r } = linearRegression(xValues, rawYValues)
    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const r2 = r * r
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
      text: `ŷ = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}<br>r = ${r.toFixed(3)}, r² = ${r2.toFixed(3)}`,
      showarrow: false,
      font: { size: 12, color: '#EF4444' },
      bgcolor: 'rgba(255,255,255,0.8)',
      bordercolor: '#EF4444',
      borderwidth: 1,
      borderpad: 4,
    }]
  }

  return (
    <div className="space-y-2">
      <div className="px-4 pt-2">
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer">
          <input type="checkbox" checked={showBestFit} onChange={e => setShowBestFit(e.target.checked)} className="accent-[var(--color-accent)]" />
          Show best-fit line
        </label>
      </div>
      <div className="px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            xaxis: { title: { text: xCol.name } },
            yaxis: { title: { text: yCol.name }, ...(yAxisRange ? { range: yAxisRange } : {}) },
            showlegend: !!colorByColId,
            annotations,
          }}
          title={`${yCol.name} vs ${xCol.name}`}
        />
      </div>
    </div>
  )
}
