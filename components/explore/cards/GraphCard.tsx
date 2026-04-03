'use client'

import { useDroppable } from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
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
import { MosaicPlot } from '@/components/charts/MosaicPlot'
import { AnimatedCaseLayer, deriveGraphMorphSpec, MorphSpec } from '@/components/charts/AnimatedCaseLayer'

interface GraphCardProps {
  cardId: string
  config: GraphCardConfig
  onClearZone: (zone: string) => void
  onSetChartType: (ct: ChartType) => void
  onAssignZone: (zone: 'x' | 'y' | 'group', colId: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

export function GraphCard({ cardId, config, onClearZone, onSetChartType, onAssignZone, onRemove, hideHeader }: GraphCardProps) {
  const { grid } = useStore()
  const [showBestFitLine, setShowBestFitLine] = useState(false)
  const [manualTableGraphType, setManualTableGraphType] = useState<'segmented' | 'sidebyside' | 'mosaic'>('segmented')
  const [manualTableValueMode, setManualTableValueMode] = useState<'count' | 'row'>('count')
  const manualTable = config.manualTable ?? null

  const xCol = !manualTable && config.xColId ? (grid.columns.find(c => c.id === config.xColId) ?? null) : null
  const yCol = !manualTable && config.yColId ? (grid.columns.find(c => c.id === config.yColId) ?? null) : null
  const groupCol = !manualTable && config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null

  const { primary, alternatives, orientation } = inferCharts(
    xCol?.type ?? null,
    yCol?.type ?? null,
    groupCol?.type ?? null,
  )
  const usesAxisGrouping =
    (xCol?.type === 'numeric' && yCol?.type === 'categorical') ||
    (xCol?.type === 'categorical' && yCol?.type === 'numeric') ||
    (xCol?.type === 'categorical' && yCol?.type === 'categorical')

  const currentChart = config.chartType ?? primary
  const morphSpec = deriveGraphMorphSpec({
    currentChart,
    xColId: config.xColId,
    yColId: config.yColId,
    groupColId: config.groupColId,
    xType: xCol?.type ?? null,
    yType: yCol?.type ?? null,
    groupType: groupCol?.type ?? null,
    orientation,
    xColName: xCol?.name,
    yColName: yCol?.name,
    groupColName: groupCol?.name,
  })
  const prevMorphSpecRef = useRef(morphSpec)
  const [activeTransition, setActiveTransition] = useState<{
    from: MorphSpec
    to: MorphSpec
    nonce: number
  } | null>(null)

  const inferredList = primary ? [primary, ...alternatives] : []
  const chartButtons: ChartType[] = (currentChart && !inferredList.includes(currentChart))
    ? [currentChart, ...inferredList]
    : inferredList

  // Canvas drop zone — active only in blank state so a first drop goes to X
  const { setNodeRef: setCanvasRef, isOver: isOverCanvas } = useDroppable({
    id: `${cardId}:canvas`,
    disabled: !!currentChart,
  })

  function handleNativeDrop(zone: 'x' | 'y' | 'group') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      onAssignZone(zone, colId)
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function renderChart() {
    if (manualTable && manualTableGraphType === 'mosaic') {
      return (
        <MosaicPlot
          xColId={config.xColId}
          fillColId={config.groupColId}
          manualTable={manualTable}
          modeOverride={manualTableValueMode}
          showControls={false}
        />
      )
    }

    // Y-only: render vertically (values on y-axis)
    if (config.yColId && !config.xColId) {
      switch (currentChart) {
        case 'histogram':  return <Histogram colId={config.yColId} groupColId={config.groupColId} orientation="v" />
        case 'dot':        return <DotPlot colId={config.yColId} groupByColId={config.groupColId} orientation="v" />
        case 'box':        return <BoxPlot colId={config.yColId} groupColId={config.groupColId} orientation="v" />
        case 'bar':        return <BarChart colId={config.yColId} orientation="v" />
        case 'pie':        return <PieChart colId={config.yColId} groupColId={config.groupColId} />
        case 'normalprob': return <NormalProbPlot colId={config.yColId} />
        default: break
      }
    }

    const mainColId = orientation === 'h' ? config.xColId : config.yColId
    const hCatAndVNum = xCol?.type === 'categorical' && yCol?.type === 'numeric'
    const hNumAndVCat = xCol?.type === 'numeric' && yCol?.type === 'categorical'
    const hCatAndVCat = xCol?.type === 'categorical' && yCol?.type === 'categorical'
    const effectiveGroupColId = config.groupColId ?? (hCatAndVCat ? config.yColId : null)

    switch (currentChart) {
      case 'histogram':
        return hNumAndVCat
          ? <Histogram colId={config.xColId} groupColId={config.yColId} orientation="h" />
          : <Histogram colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'dot':
        return hCatAndVNum
          ? <DotPlot colId={config.yColId} groupByColId={config.xColId} orientation="h" />
          : hNumAndVCat
            ? <DotPlot colId={config.xColId} groupByColId={config.yColId} orientation="h" />
            : <DotPlot colId={mainColId} groupByColId={config.groupColId} orientation={orientation} />
      case 'box':
        return hCatAndVNum
          ? <BoxPlot colId={config.yColId} groupColId={config.xColId} orientation="v" />
          : hNumAndVCat
            ? <BoxPlot colId={config.xColId} groupColId={config.yColId} orientation="h" />
            : <BoxPlot colId={mainColId} groupColId={config.groupColId} orientation={orientation} />
      case 'scatter':    return <ScatterPlot xColId={config.xColId} yColId={config.yColId} colorByColId={config.groupColId} />
      case 'bar':        return <BarChart colId={mainColId} orientation={orientation} />
      case 'pie':        return <PieChart colId={mainColId} groupColId={effectiveGroupColId} />
      case 'segmented':  return (
        <SegmentedBar
          xColId={config.xColId}
          fillColId={effectiveGroupColId}
          manualTable={manualTable ?? undefined}
          modeOverride={manualTable ? manualTableValueMode : undefined}
          barmodeOverride={manualTable ? (manualTableGraphType === 'segmented' ? 'stack' : 'group') : undefined}
          showControls={!manualTable}
        />
      )
      case 'mosaic':     return (
        <MosaicPlot
          xColId={config.xColId}
          fillColId={effectiveGroupColId}
          manualTable={manualTable ?? undefined}
          modeOverride={manualTable ? manualTableValueMode : undefined}
          showControls={!manualTable}
        />
      )
      case 'normalprob': return <NormalProbPlot colId={mainColId} />
      default:           return null
    }
  }

  const isBlank = !currentChart
  const hasRows = grid.rows.some(r => Object.values(r).some(v => String(v ?? '').trim() !== ''))
  const isManualSegmented = !!manualTable

  useEffect(() => {
    const prev = prevMorphSpecRef.current
    if (morphSpec && prev && JSON.stringify(prev) !== JSON.stringify(morphSpec)) {
      setActiveTransition({ from: prev, to: morphSpec, nonce: Date.now() })
    }
    prevMorphSpecRef.current = morphSpec
  }, [morphSpec])

  // dot and scatter stay in the custom-rendered AnimatedCaseLayer permanently
  const isCustomRendered =
    morphSpec !== null &&
    (morphSpec.kind === 'dot' || morphSpec.kind === 'scatter')

  const showAnimatedBlank     = isBlank && !!morphSpec && hasRows
  const showAnimatedTransition = !isBlank && !!activeTransition
  const showSettledCustom     = !isBlank && !activeTransition && isCustomRendered
  const showDirectChart       = !isBlank && !activeTransition && !isCustomRendered

  const inner = (
    <div className="flex flex-col h-full">

      {/* Top row: chart type pills | Group zone compact upper-right */}
      <div className="flex-shrink-0 flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-h-[40px]">
          {manualTable && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-[var(--color-muted)] whitespace-nowrap">Graph:</span>
                {([
                  ['segmented', 'Segmented Bar'],
                  ['sidebyside', 'Side-by-Side Bar'],
                  ['mosaic', 'Mosaic Plot'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => setManualTableGraphType(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      manualTableGraphType === type
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-[var(--color-muted)] whitespace-nowrap">Values:</span>
                {([
                  ['count', 'Counts'],
                  ['row', 'Row %'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setManualTableValueMode(mode)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      manualTableValueMode === mode
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!manualTable && chartButtons.length > 0 && (
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
          {currentChart === 'scatter' && xCol?.type === 'numeric' && yCol?.type === 'numeric' && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer whitespace-nowrap ml-1">
              <input
                type="checkbox"
                checked={showBestFitLine}
                onChange={e => setShowBestFitLine(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Show best-fit line
            </label>
          )}
        </div>

        {/* Group — compact square upper right */}
        {!usesAxisGrouping && !isManualSegmented && (
          <div className="flex-shrink-0 w-24">
            <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('group')}>
              <DropZone
                id={`${cardId}:group`}
                label="Group"
                hint="optional"
                assignedCol={groupCol}
                onClear={() => onClearZone('group')}
              />
            </div>
          </div>
        )}
      </div>

      {/*
        Spatial grid layout:
          col 1 (36px): Response Variable zone  — same height as chart rectangle
          col 2 (1fr):  chart rectangle          — fills remaining space
          row 2 col 2:  Explanatory Variable     — same width as chart rectangle
      */}
      {isManualSegmented ? (
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden">
          <GraphCardContext.Provider value={{ hideAxisTitles: true }}>
            {renderChart()}
          </GraphCardContext.Provider>
        </div>
      ) : (
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
          <div className="h-full" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('y')}>
            <DropZone
              id={`${cardId}:y`}
              label="Response Variable"
              hint="drop here"
              assignedCol={yCol}
              onClear={() => onClearZone('y')}
              variant="vertical"
            />
          </div>
        </div>

        {/* Row 1, Col 2 — Main chart rectangle / canvas */}
        <div
          ref={setCanvasRef}
          style={{ gridRow: '1', gridColumn: '2' }}
          onDragOver={handleNativeDragOver}
          onDrop={handleNativeDrop('x')}
          className={`min-h-[180px] overflow-hidden rounded-xl transition-colors ${
            isBlank
              ? isOverCanvas
                ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                : 'border-2 border-dashed border-[var(--color-border)] bg-slate-50/80'
              : ''
          }`}
        >
          {showAnimatedBlank ? (
            <AnimatedCaseLayer key="stable" spec={morphSpec!} showHint />
          ) : showAnimatedTransition ? (
            <AnimatedCaseLayer
              key={activeTransition!.nonce}
              spec={activeTransition!.to}
              fromSpec={activeTransition!.from}
              showBestFitLine={activeTransition!.to.kind === 'scatter' ? showBestFitLine : false}
              onRest={() => setActiveTransition(null)}
            />
          ) : showSettledCustom ? (
            <AnimatedCaseLayer key="stable" spec={morphSpec!} showBestFitLine={morphSpec!.kind === 'scatter' ? showBestFitLine : false} />
          ) : isBlank ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
              <span className="text-4xl opacity-25 select-none">📈</span>
              <p className="text-sm font-medium text-[var(--color-muted)]">Drop a variable to get started</p>
              <p className="text-xs text-[var(--color-muted)] opacity-70">
                Drag and drop a variable from the sidebar to begin.
              </p>
            </div>
          ) : showDirectChart ? (
            <GraphCardContext.Provider value={{ hideAxisTitles: true }}>
              {renderChart()}
            </GraphCardContext.Provider>
          ) : null}
        </div>

        {/* Row 2, Col 1 — empty (below response zone) */}

        {/* Row 2, Col 2 — Explanatory Variable (always visible, same width as chart) */}
        <div style={{ gridRow: '2', gridColumn: '2' }}>
          <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('x')}>
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
      )}
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
