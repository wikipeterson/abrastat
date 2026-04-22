'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { EmptyState } from '@/components/ui/EmptyState'
import { ManualTwoWayTableSnapshot } from '@/lib/exploreTypes'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'
import { truncateChartLabel } from '@/lib/chartLabels'

interface MosaicPlotProps {
  xColId: string | null
  fillColId: string | null
  manualTable?: ManualTwoWayTableSnapshot
  modeOverride?: 'count' | 'row'
  showControls?: boolean
}

interface MosaicColumn {
  label: string
  total: number
  segments: {
    label: string
    count: number
    columnPercent: number
    overallPercent: number
    color: string
  }[]
}

interface PositionedMosaicColumn extends MosaicColumn {
  left: number
  width: number
}

export function MosaicPlot({
  xColId,
  fillColId,
  manualTable,
  modeOverride,
  showControls = true,
}: MosaicPlotProps) {
  const { grid } = useStore()
  const { colors, hideAxisTitles } = useGraphCardContext()
  const [mode, setMode] = useState<'count' | 'row'>('count')
  const effectiveMode = modeOverride ?? mode

  const xCol = grid.columns.find(c => c.id === xColId)
  const fillCol = grid.columns.find(c => c.id === fillColId)

  const { columns, fillLabels, xAxisTitle, legendTitle } = useMemo(() => {
    if (manualTable) {
      const grandTotal = manualTable.cells.flat().reduce((sum, value) => sum + (value ?? 0), 0)
      const derivedColumns = manualTable.colLabels.map((colLabel, ci) => {
        const counts = manualTable.rowLabels.map((_, ri) => manualTable.cells[ri]?.[ci] ?? 0)
        const total = counts.reduce((sum, value) => sum + value, 0)
        return {
          label: colLabel,
          total,
          segments: manualTable.rowLabels.map((rowLabel, ri) => {
            const count = counts[ri]
            return {
              label: rowLabel,
              count,
              columnPercent: total ? count / total : 0,
              overallPercent: grandTotal ? count / grandTotal : 0,
              color: colors[ri % colors.length],
            }
          }),
        }
      })

      return {
        columns: derivedColumns,
        fillLabels: manualTable.rowLabels,
        xAxisTitle: truncateChartLabel(manualTable.explName),
        legendTitle: truncateChartLabel(manualTable.respName),
      }
    }

    if (!xCol || !fillCol) {
      return {
        columns: [] as MosaicColumn[],
        fillLabels: [] as string[],
        xAxisTitle: truncateChartLabel(xCol?.name ?? ''),
        legendTitle: truncateChartLabel(fillCol?.name ?? ''),
      }
    }

    const pairedValues = grid.rows.flatMap(row => {
      const xValue = String(row[xCol.id] ?? '').trim()
      const fillValue = String(row[fillCol.id] ?? '').trim()
      if (!xValue || !fillValue) return []
      return [{ xValue, fillValue }]
    })

    const xGroups = sortCategoryValues([...new Set(pairedValues.map(pair => pair.xValue))])
    const fillGroups = sortCategoryValues([...new Set(pairedValues.map(pair => pair.fillValue))])
    const grandTotal = pairedValues.length

    const derivedColumns = xGroups.map((xGroup) => {
      const total = pairedValues.filter(pair => pair.xValue === xGroup).length
      return {
        label: xGroup,
        total,
        segments: fillGroups.map((fillGroup, gi) => {
          const count = pairedValues.filter(pair => pair.xValue === xGroup && pair.fillValue === fillGroup).length
          return {
            label: fillGroup,
            count,
            columnPercent: total ? count / total : 0,
            overallPercent: grandTotal ? count / grandTotal : 0,
            color: colors[gi % colors.length],
          }
        }),
      }
    })

    return {
      columns: derivedColumns,
      fillLabels: fillGroups,
      xAxisTitle: truncateChartLabel(xCol.name),
      legendTitle: truncateChartLabel(fillCol.name),
    }
  }, [fillCol, grid, manualTable, xCol])

  const svgWidth = 840
  const svgHeight = 420
  const margin = hideAxisTitles
    ? { top: 28, right: 132, bottom: 48, left: 28 }
    : { top: 28, right: 210, bottom: 64, left: 28 }
  const plotWidth = svgWidth - margin.left - margin.right
  const plotHeight = svgHeight - margin.top - margin.bottom
  const legendX = margin.left + plotWidth + 40
  const grandTotal = columns.reduce((sum, column) => sum + column.total, 0)
  const positionedColumns = useMemo<PositionedMosaicColumn[]>(() => {
    return columns.reduce<{
      items: PositionedMosaicColumn[]
      nextLeft: number
    }>((acc, column) => {
      const width = grandTotal ? (column.total / grandTotal) * plotWidth : 0
      return {
        items: [...acc.items, { ...column, left: acc.nextLeft, width }],
        nextLeft: acc.nextLeft + width,
      }
    }, {
      items: [],
      nextLeft: margin.left,
    }).items
  }, [columns, grandTotal, margin.left, plotWidth])

  if (!manualTable && (!xCol || !fillCol)) {
    return <EmptyState icon="🧩" title="Select two variables" description="Choose an X variable and a Fill variable above." />
  }

  if (!columns.length || grandTotal === 0) {
    return <EmptyState icon="🧩" title="Not enough data" description="Add some counts to see a mosaic plot." />
  }

  return (
    <div className="h-full flex flex-col">
      {showControls && (
        <div className="flex-shrink-0 flex gap-2 px-4 pt-2">
          {([
            ['count', 'Counts'],
            ['row', '%'],
          ] as const).map(([nextMode, label]) => (
            <button
              key={nextMode}
              onClick={() => setMode(nextMode)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                effectiveMode === nextMode
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 px-4 pb-2">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-full w-full">
          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="white"
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth="1"
            rx="6"
          />

          {positionedColumns.map((column) => {
            const columnWidth = column.width
            const columnLeft = column.left
            let yCursor = margin.top + plotHeight

            return (
              <g key={column.label}>
                {column.segments.map((segment) => {
                  const segmentRatio = effectiveMode === 'count'
                    ? segment.columnPercent
                    : segment.columnPercent
                  const segmentHeight = segmentRatio * plotHeight
                  const segmentTop = yCursor - segmentHeight
                  yCursor = segmentTop

                  const tooltip = effectiveMode === 'count'
                    ? `${column.label}, ${segment.label}: ${segment.count} (${(segment.overallPercent * 100).toFixed(1)}% of total)`
                    : `${column.label}, ${segment.label}: ${(segment.columnPercent * 100).toFixed(1)}% within ${column.label}`

                  return (
                    <g key={`${column.label}:${segment.label}`}>
                      <rect
                        x={columnLeft}
                        y={segmentTop}
                        width={Math.max(columnWidth, 0)}
                        height={Math.max(segmentHeight, 0)}
                        fill={segment.color}
                        stroke="white"
                        strokeWidth="1.5"
                      >
                        <title>{tooltip}</title>
                      </rect>
                      {columnWidth > 68 && segmentHeight > 28 && (
                        <text
                          x={columnLeft + columnWidth / 2}
                          y={segmentTop + segmentHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize="12"
                          fontWeight="600"
                        >
                          {effectiveMode === 'count'
                            ? segment.count
                            : `${Math.round(segment.columnPercent * 100)}%`}
                        </text>
                      )}
                    </g>
                  )
                })}

                <text
                  x={columnLeft + columnWidth / 2}
                  y={margin.top + plotHeight + 24}
                  textAnchor="middle"
                  fill="rgb(51 65 85)"
                  fontSize="12"
                  fontWeight="600"
                >
                  {column.label}
                </text>
                <text
                  x={columnLeft + columnWidth / 2}
                  y={margin.top + plotHeight + 40}
                  textAnchor="middle"
                  fill="rgb(100 116 139)"
                  fontSize="11"
                >
                  {Math.round((column.total / grandTotal) * 100)}%
                </text>
              </g>
            )
          })}

          {!hideAxisTitles && (
            <text
              x={margin.left + plotWidth / 2}
              y={svgHeight - 12}
              textAnchor="middle"
              fill="rgb(51 65 85)"
              fontSize="13"
              fontWeight="600"
            >
              {xAxisTitle}
            </text>
          )}

          {!hideAxisTitles && (
            <text
              x={legendX}
              y={margin.top + 8}
              fill="rgb(51 65 85)"
              fontSize="14"
              fontWeight="700"
            >
              {legendTitle}
            </text>
          )}

          {fillLabels.map((label, index) => (
            <g key={label} transform={`translate(${legendX}, ${margin.top + (hideAxisTitles ? 8 : 28) + index * 24})`}>
              <rect width="14" height="14" rx="3" fill={colors[index % colors.length]} />
              <text x="22" y="11" fill="rgb(51 65 85)" fontSize="12" fontWeight="500">
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
