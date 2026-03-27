'use client'

import { useStore } from '@/lib/store'
import { ChartType, CHART_META, inferCharts } from '@/lib/chartHelpers'
import { GraphCardConfig } from '@/lib/exploreTypes'
import { DropZone } from '../DropZone'
import { Histogram } from '@/components/charts/Histogram'
import { BoxPlot } from '@/components/charts/BoxPlot'
import { ScatterPlot } from '@/components/charts/ScatterPlot'
import { BarChart } from '@/components/charts/BarChart'
import { DotPlot } from '@/components/charts/DotPlot'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { NormalProbPlot } from '@/components/charts/NormalProbPlot'
import { EmptyState } from '@/components/ui/EmptyState'

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

  // If user has explicitly chosen a chart type, always honour it.
  // Only fall back to the inferred primary when no choice has been stored.
  const currentChart = config.chartType ?? primary

  // Button list: inferred suggestions + current choice if it would otherwise be missing
  const inferredList = primary ? [primary, ...alternatives] : []
  const chartButtons: ChartType[] = (currentChart && !inferredList.includes(currentChart))
    ? [currentChart, ...inferredList]
    : inferredList

  function renderChart() {
    const mainColId = orientation === 'h' ? config.xColId : config.yColId
    const hCatAndVNum = xCol?.type === 'categorical' && yCol?.type === 'numeric'

    switch (currentChart) {
      case 'histogram':
        return <Histogram colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'dot':
        return hCatAndVNum
          ? <DotPlot colId={config.yColId} groupByColId={config.xColId} orientation="h" />
          : <DotPlot colId={mainColId} groupByColId={config.groupColId} orientation={orientation} />
      case 'box':
        return hCatAndVNum
          ? <BoxPlot colId={config.yColId} groupColId={config.xColId} orientation="v" />
          : <BoxPlot colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'scatter':
        return <ScatterPlot xColId={config.xColId} yColId={config.yColId} colorByColId={config.groupColId} />
      case 'bar':
        return <BarChart colId={mainColId} orientation={orientation} />
      case 'segmented':
        return <SegmentedBar xColId={config.xColId} fillColId={config.groupColId} />
      case 'normalprob':
        return <NormalProbPlot colId={mainColId} />
      default:
        return (
          <EmptyState
            icon="📈"
            title="Drop a variable to get started"
            description="Drag a variable from the sidebar into the Explanatory Variable zone below."
          />
        )
    }
  }

  // Top control row + axis layout — shared between both render modes
  const inner = (
    <div className="flex flex-col h-full">
      {/* Top row: chart type pills | Group zone (upper-right) */}
      <div className="flex-shrink-0 flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-h-[44px]">
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

        {/* Group zone — compact, upper right */}
        <div className="flex-shrink-0 w-24">
          <DropZone id={`${cardId}:group`} label="Group" hint="optional"
            assignedCol={groupCol} onClear={() => onClearZone('group')} />
        </div>
      </div>

      {/* Spatial axis layout: Y left | chart+X right */}
      <div className="flex-1 min-h-0 flex gap-2">
        {/* Response Variable (Y) — vertical zone, left edge */}
        <div className="flex-shrink-0 w-10 self-stretch">
          <DropZone id={`${cardId}:y`} label="Response Variable" hint="drop here"
            assignedCol={yCol} onClear={() => onClearZone('y')} variant="vertical" />
        </div>

        {/* Chart area + Explanatory Variable below */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Chart area — fills remaining vertical space */}
          <div className={`flex-1 min-h-[200px] min-w-0 overflow-hidden rounded-xl ${
            !currentChart ? 'bg-[var(--color-accent-light)]/40 border-2 border-dashed border-[var(--color-border)] flex items-center justify-center' : ''
          }`}>
            {renderChart()}
          </div>

          {/* Explanatory Variable (X) — hidden once filled, reappears when cleared */}
          {!xCol && (
            <div className="flex-shrink-0 flex justify-center">
              <div className="w-full max-w-xs">
                <DropZone id={`${cardId}:x`} label="Explanatory Variable" hint="any variable"
                  assignedCol={xCol} onClear={() => onClearZone('x')} />
              </div>
            </div>
          )}
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

