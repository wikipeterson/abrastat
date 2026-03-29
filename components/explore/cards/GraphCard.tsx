'use client'

import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@/lib/store'
import { ChartType, CHART_META, inferCharts } from '@/lib/chartHelpers'
import { GraphCardConfig } from '@/lib/exploreTypes'
import { GraphCardContext } from '@/lib/graphCardContext'
import { DropZone } from '../DropZone'
import { Histogram } from '@/components/charts/Histogram'
import { BoxPlot } from '@/components/charts/BoxPlot'
import { ScatterPlot } from '@/components/charts/ScatterPlot'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { DotPlot } from '@/components/charts/DotPlot'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { NormalProbPlot } from '@/components/charts/NormalProbPlot'

interface GraphCardProps {
  cardId: string
  config: GraphCardConfig
  onClearZone: (zone: string) => void
  onSetChartType: (ct: ChartType) => void
  onRemove: () => void
  hideHeader?: boolean
}

export function GraphCard({ cardId, config, onClearZone, onSetChartType, onRemove, hideHeader }: GraphCardProps) {
  const { grid } = useStore()

  const xCol = config.xColId ? (grid.columns.find(c => c.id === config.xColId) ?? null) : null
  const yCol = config.yColId ? (grid.columns.find(c => c.id === config.yColId) ?? null) : null
  const groupCol = config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null

  const { primary, alternatives, orientation } = inferCharts(
    xCol?.type ?? null,
    yCol?.type ?? null,
    groupCol?.type ?? null,
  )

  const currentChart = config.chartType ?? primary

  const inferredList = primary ? [primary, ...alternatives] : []
  const chartButtons: ChartType[] = (currentChart && !inferredList.includes(currentChart))
    ? [currentChart, ...inferredList]
    : inferredList

  // Canvas drop zone — active only in blank state so a first drop goes to X
  const { setNodeRef: setCanvasRef, isOver: isOverCanvas } = useDroppable({
    id: `${cardId}:canvas`,
    disabled: !!currentChart,
  })

  function renderChart() {
    // Y-only: render vertically (values on y-axis)
    if (config.yColId && !config.xColId) {
      switch (currentChart) {
        case 'histogram':  return <Histogram colId={config.yColId} groupColId={config.groupColId} orientation="v" />
        case 'dot':        return <DotPlot colId={config.yColId} groupByColId={config.groupColId} orientation="v" />
        case 'box':        return <BoxPlot colId={config.yColId} groupColId={config.groupColId} orientation="v" />
        case 'bar':        return <BarChart colId={config.yColId} orientation="v" />
        case 'pie':        return <PieChart colId={config.yColId} />
        case 'normalprob': return <NormalProbPlot colId={config.yColId} />
        default: break
      }
    }

    const mainColId = orientation === 'h' ? config.xColId : config.yColId
    const hCatAndVNum = xCol?.type === 'categorical' && yCol?.type === 'numeric'

    switch (currentChart) {
      case 'histogram':  return <Histogram colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'dot':
        return hCatAndVNum
          ? <DotPlot colId={config.yColId} groupByColId={config.xColId} orientation="h" />
          : <DotPlot colId={mainColId} groupByColId={config.groupColId} orientation={orientation} />
      case 'box':
        return hCatAndVNum
          ? <BoxPlot colId={config.yColId} groupColId={config.xColId} orientation="v" />
          : <BoxPlot colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'scatter':    return <ScatterPlot xColId={config.xColId} yColId={config.yColId} colorByColId={config.groupColId} />
      case 'bar':        return <BarChart colId={mainColId} orientation={orientation} />
      case 'pie':        return <PieChart colId={mainColId} />
      case 'segmented':  return <SegmentedBar xColId={config.xColId} fillColId={config.groupColId} />
      case 'normalprob': return <NormalProbPlot colId={mainColId} />
      default:           return null
    }
  }

  const isBlank = !currentChart

  const inner = (
    <div className="flex flex-col h-full">

      {/* Top row: chart type pills | Group zone compact upper-right */}
      <div className="flex-shrink-0 flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-h-[40px]">
          {chartButtons.length > 0 && (
            <>
              <span className="text-xs font-medium text-[var(--color-muted)]">Chart type:</span>
              {chartButtons.map(ct => (
                <button
                  key={ct}
                  onClick={() => onSetChartType(ct)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    currentChart === ct
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-slate-300'
                  }`}
                >
                  <span>{CHART_META[ct].icon}</span>
                  {CHART_META[ct].label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Group — compact square upper right */}
        <div className="flex-shrink-0 w-24">
          <DropZone
            id={`${cardId}:group`}
            label="Group"
            hint="optional"
            assignedCol={groupCol}
            onClear={() => onClearZone('group')}
          />
        </div>
      </div>

      {/*
        Spatial grid layout:
          col 1 (36px): Response Variable zone  — same height as chart rectangle
          col 2 (1fr):  chart rectangle          — fills remaining space
          row 2 col 2:  Explanatory Variable     — same width as chart rectangle
      */}
      <div
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: '36px 1fr',
          gridTemplateRows: '1fr auto',
          gap: '6px',
        }}
      >
        {/* Row 1, Col 1 — Response Variable (vertical drop zone) */}
        <div style={{ gridRow: '1', gridColumn: '1' }}>
          <DropZone
            id={`${cardId}:y`}
            label="Response Variable"
            hint="drop here"
            assignedCol={yCol}
            onClear={() => onClearZone('y')}
            variant="vertical"
          />
        </div>

        {/* Row 1, Col 2 — Main chart rectangle / canvas */}
        <div
          ref={setCanvasRef}
          style={{ gridRow: '1', gridColumn: '2' }}
          className={`min-h-[180px] overflow-hidden rounded-xl transition-colors ${
            isBlank
              ? isOverCanvas
                ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                : 'border-2 border-dashed border-[var(--color-border)] bg-slate-50/80'
              : ''
          }`}
        >
          {isBlank ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
              <span className="text-4xl opacity-25 select-none">📈</span>
              <p className="text-sm font-medium text-[var(--color-muted)]">Drop a variable to get started</p>
              <p className="text-xs text-[var(--color-muted)] opacity-70">
                Drag and drop a variable from the sidebar to begin.
              </p>
            </div>
          ) : (
            <GraphCardContext.Provider value={{ hideAxisTitles: true }}>
              {renderChart()}
            </GraphCardContext.Provider>
          )}
        </div>

        {/* Row 2, Col 1 — empty (below response zone) */}

        {/* Row 2, Col 2 — Explanatory Variable (always visible, same width as chart) */}
        <div style={{ gridRow: '2', gridColumn: '2' }}>
          <DropZone
            id={`${cardId}:x`}
            label="Explanatory Variable"
            hint="any variable"
            assignedCol={xCol}
            onClear={() => onClearZone('x')}
          />
        </div>
      </div>
    </div>
  )

  if (hideHeader) {
    return <div className="h-full">{inner}</div>
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Graph</span>
        <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
      </div>
      <div className="p-4" style={{ minHeight: 480 }}>
        {inner}
      </div>
    </div>
  )
}
