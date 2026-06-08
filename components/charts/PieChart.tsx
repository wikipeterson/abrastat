'use client'

import { useState, useMemo } from 'react'
import { createPlotlySelectionStyles, extractRowsFromPlotlyPoints, selectedPointIndicesForTrace, unionBrushRows, useEffectiveBrushSet } from '@/lib/linkedBrush'
import { useStore } from '@/lib/store'
import { getFrequencyTable } from '@/lib/statistics'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'
import { truncateChartLabel } from '@/lib/chartLabels'

interface PieChartProps {
  colId: string | null
  groupColId?: string | null
}

export function PieChart({ colId, groupColId }: PieChartProps) {
  const { grid } = useStore()
  const pinnedBrush = useStore(state => state.brush.pinned)
  const setBrushHover = useStore(state => state.setBrushHover)
  const setBrushPinned = useStore(state => state.setBrushPinned)
  const clearBrush = useStore(state => state.clearBrush)
  const effectiveBrushSet = useEffectiveBrushSet()
  const { hideAxisTitles, colors } = useGraphCardContext()
  const col      = grid.columns.find(c => c.id === colId)
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null

  const [showPercent, setShowPercent] = useState(false)

  // All category values (filtered to non-empty rows)
  const { allValues, allGroups } = useMemo(() => {
    if (!colId) return { allValues: [], allGroups: [] }
    const raw = grid.rows.map(r => ({
      value: String(r[colId] ?? '').trim(),
      group: groupColId ? String(r[groupColId] ?? '').trim() : '',
    })).filter(r => r.value && (!groupColId || r.group))
    const allGroups = groupColId
      ? sortCategoryValues([...new Set(raw.map(r => r.group))].filter(g => g))
      : []
    return { allValues: raw, allGroups }
  }, [grid, colId, groupColId])

  // Build a stable color map so the same category always gets the same color
  const categoryColors = useMemo(() => {
    const cats = sortCategoryValues([...new Set(allValues.map(r => r.value))])
    return Object.fromEntries(cats.map((cat, i) => [cat, colors[i % colors.length]]))
  }, [allValues, colors])

  if (!colId || !col) {
    return <EmptyState icon="🥧" title="Drop a categorical variable" description="Drag a categorical variable to see a pie chart of frequencies." />
  }
  if (allValues.length === 0) {
    return <EmptyState icon="🥧" title="No data" description="No non-empty values found in this column." />
  }
  const colLabel = truncateChartLabel(col.name)

  const hasGroups = allGroups.length > 1

  // Build traces — one per group (or one total if no grouping)
  const groups = hasGroups ? allGroups : ['']
  const MAX_GROUPS = 6

  const traces = groups.slice(0, MAX_GROUPS).map((group, gi) => {
    const subset = hasGroups
      ? allValues
          .map((r, rowIndex) => ({ ...r, rowIndex }))
          .filter(r => r.group === group)
      : allValues.map((r, rowIndex) => ({ ...r, rowIndex }))

    const freq = getFrequencyTable(subset.map(r => r.value)).slice(0, 20)
    const labels = freq.map(r => r.value)
    const values = freq.map(r => r.count)
    const rowGroups = labels.map(label =>
      subset.filter(item => item.value === label).map(item => item.rowIndex),
    )
    const sliceColors = labels.map(l => categoryColors[l] ?? colors[0])

    // Domain: lay groups out in a row (up to 3 per row, then wrap)
    const perRow = Math.min(groups.length, 3)
    const rows = Math.ceil(groups.length / perRow)
    const col_ = gi % perRow
    const row  = Math.floor(gi / perRow)
    const gap = 0.04
    const cellW = (1 - gap * (perRow - 1)) / perRow
    const cellH = (1 - gap * (rows - 1)) / rows
    const xStart = col_ * (cellW + gap)
    const yStart = 1 - (row + 1) * (cellH + gap) + gap
    const domain = hasGroups
      ? { x: [xStart, xStart + cellW] as [number, number], y: [Math.max(0, yStart), yStart + cellH] as [number, number] }
      : { x: [0, 1] as [number, number], y: [0, 1] as [number, number] }

    return createPlotlySelectionStyles({
      type: 'pie' as const,
      labels,
      values,
      customdata: rowGroups,
      selectedpoints: effectiveBrushSet.size > 0
        ? selectedPointIndicesForTrace(rowGroups, effectiveBrushSet) ?? undefined
        : undefined,
      name: group || colLabel,
      title: hasGroups ? { text: group, font: { size: 12 } } : undefined,
      domain,
      marker: { colors: sliceColors },
      textinfo: (showPercent ? 'percent' : 'value') as 'percent' | 'value',
      hovertemplate: showPercent
        ? '%{label}: %{percent}<extra></extra>'
        : '%{label}: %{value}<extra></extra>',
      textfont: { size: 11 },
      hole: 0,
      // Show legend only on first trace to avoid duplication
      showlegend: gi === 0 && !hasGroups,
    })
  })

  const tooManyGroups = hasGroups && allGroups.length > MAX_GROUPS

  const margin = hideAxisTitles
    ? { t: 40, r: 16, b: 8, l: 16 }   // t:40 gives room for outside slice labels
    : { t: 40, r: 120, b: 16, l: 16 }

  return (
    <div className="h-full flex flex-col gap-2">

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-1">
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
          <button
            onClick={() => setShowPercent(false)}
            className={`px-2.5 py-1 font-medium transition-colors ${!showPercent ? 'bg-[var(--color-text)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}
          >
            Count
          </button>
          <button
            onClick={() => setShowPercent(true)}
            className={`px-2.5 py-1 font-medium transition-colors border-l border-[var(--color-border)] ${showPercent ? 'bg-[var(--color-text)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}
          >
            Percent
          </button>
        </div>

        {groupCol && (
          <span className="text-xs text-[var(--color-muted)]">
            by <span className="font-medium text-[var(--color-text)]">{groupCol.name}</span>
          </span>
        )}

        {tooManyGroups && (
          <span className="text-xs text-[var(--color-gold-text)]">Showing first {MAX_GROUPS} of {allGroups.length} groups</span>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={traces as any}
          layout={{
            showlegend: !hasGroups,
            legend: { orientation: 'v', x: 1.02, y: 0.5 },
            margin,
            // When showing multiple pies, annotations serve as group titles (already set via trace title)
          }}
          title={hideAxisTitles ? undefined : colLabel}
          onHover={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushHover(rows)
          }}
          onUnhover={() => setBrushHover([])}
          onClick={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            if (rows.length === 0) return
            setBrushPinned(unionBrushRows(pinnedBrush, rows))
          }}
          onSelected={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushPinned(unionBrushRows(pinnedBrush, rows))
          }}
          onDeselect={clearBrush}
        />
      </div>
    </div>
  )
}
