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
            description="Drag a variable from the sidebar into the X axis zone."
          />
        )
    }
  }

  return (
    <div className={hideHeader ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden'}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Graph</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        <div className="grid grid-cols-3 gap-2">
          <DropZone id={`${cardId}:x`} label="X axis" hint="any variable"
            assignedCol={xCol} onClear={() => onClearZone('x')} />
          <DropZone id={`${cardId}:y`} label="Y axis" hint="optional"
            assignedCol={yCol} onClear={() => onClearZone('y')} />
          <DropZone id={`${cardId}:group`} label="Group" hint="optional"
            assignedCol={groupCol} onClear={() => onClearZone('group')} />
        </div>

        {chartButtons.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-[var(--color-muted)]">Chart type:</span>
            {chartButtons.map(ct => (
              <button
                key={ct}
                onClick={() => onSetChartType(ct)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium border transition-all ${
                  currentChart === ct
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-slate-300'
                }`}
              >
                <span>{CHART_META[ct].icon}</span>
                {CHART_META[ct].label}
              </button>
            ))}
          </div>
        )}

        <div>{renderChart()}</div>
      </div>
    </div>
  )
}

