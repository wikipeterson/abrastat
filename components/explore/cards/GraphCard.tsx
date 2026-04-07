'use client'

import { useDroppable } from '@dnd-kit/core'
import type { Data } from 'plotly.js'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { ChartType, CHART_META, inferCharts } from '@/lib/chartHelpers'
import { GraphCardConfig } from '@/lib/exploreTypes'
import { GraphCardContext } from '@/lib/graphCardContext'
import { exportDomAsPng, renderDomToPngBlobWithLabels, renderSvgToPngBlob } from '@/lib/exportDomAsPng'
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
import { AnimatedCaseLayer, deriveGraphMorphSpec, MorphSpec, renderAnimatedGraphToPngBlob } from '@/components/charts/AnimatedCaseLayer'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { ABRA_COLORS } from '@/lib/plotlyTheme'

interface GraphCardProps {
  cardId: string
  config: GraphCardConfig
  onClearZone: (zone: string) => void
  onSetChartType: (ct: ChartType) => void
  onSetTitle: (title: string) => void
  onAssignZone: (zone: 'x' | 'y' | 'group', colId: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

export function GraphCard({ cardId, config, onClearZone, onSetChartType, onSetTitle, onAssignZone, onRemove, hideHeader }: GraphCardProps) {
  const { grid } = useStore()
  const [bestFitMode, setBestFitMode] = useState<'none' | 'overall' | 'group'>('none')
  const [manualTableGraphType, setManualTableGraphType] = useState<'segmented' | 'sidebyside' | 'mosaic'>('segmented')
  const [manualTableValueMode, setManualTableValueMode] = useState<'count' | 'row'>('count')
  const [isCopying, setIsCopying] = useState(false)
  const manualTable = config.manualTable ?? null
  const manualScatter = config.manualScatter ?? null
  const graphExportRef = useRef<HTMLDivElement | null>(null)

  const xCol = !manualTable && !manualScatter && config.xColId ? (grid.columns.find(c => c.id === config.xColId) ?? null) : null
  const yCol = !manualTable && !manualScatter && config.yColId ? (grid.columns.find(c => c.id === config.yColId) ?? null) : null
  const groupCol = !manualTable && !manualScatter && config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null
  const hasCategoricalGrouping = groupCol?.type === 'categorical'

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

  function getExportAxisLabels() {
    if (manualScatter) {
      return { xLabel: manualScatter.xName, yLabel: manualScatter.yName }
    }

    const xLabel = xCol?.name ?? ''
    const yLabel = yCol?.name ?? ''

    if (currentChart === 'scatter') return { xLabel, yLabel }

    if (!config.xColId && config.yColId && yCol) {
      if (currentChart === 'bar' || currentChart === 'pie') {
        return { xLabel: 'Count', yLabel: yCol.name }
      }
      return { xLabel: yCol.name, yLabel: '' }
    }

    if (currentChart === 'histogram') {
      return { xLabel: xLabel || yLabel, yLabel: 'Frequency' }
    }

    if (currentChart === 'dot' || currentChart === 'box') {
      return { xLabel: xLabel || yLabel, yLabel: '' }
    }

    return { xLabel, yLabel }
  }

  async function renderGraphBlob(): Promise<Blob> {
    if (!graphExportRef.current) {
      throw new Error('Graph not ready')
    }
    const { xLabel, yLabel } = getExportAxisLabels()

    const plotEl = graphExportRef.current.querySelector('.js-plotly-plot') as HTMLElement | null
    if (plotEl) {
      const plotSvg = plotEl.querySelector('svg.main-svg') as SVGElement | null
      if (plotSvg) {
        return renderSvgToPngBlob(plotSvg, { title: config.title, xLabel, yLabel })
      }
    }

    if (isCustomRendered && morphSpec) {
      const plotArea = graphExportRef.current.querySelector('[data-graph-plot-area="true"]') as HTMLElement | null
      const rect = plotArea?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        return renderAnimatedGraphToPngBlob({
          spec: morphSpec,
          rows: grid.rows,
          width: rect.width,
          height: rect.height,
          title: config.title,
          xLabel,
          yLabel,
          showBestFitLine: useAnimatedScatter && bestFitMode === 'overall',
        })
      }
    }

    return renderDomToPngBlobWithLabels(graphExportRef.current, { title: config.title, xLabel, yLabel })
  }

  async function handleCopyGraph() {
    if (!graphExportRef.current || !currentChart || isBlank) return
    setIsCopying(true)
    try {
      const pngBlob = await renderGraphBlob()
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        await exportDomAsPng(
          graphExportRef.current,
          `${(config.title || 'graph-card').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'graph-card'}.png`
        )
        window.alert('Copy is not supported in this browser. Downloaded PNG instead.')
        return
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ])
      window.alert('Graph copied. Paste it into Google Docs.')
    } catch (error) {
      console.error(error)
      window.alert('Graph copy failed. Please try again.')
    } finally {
      setIsCopying(false)
    }
  }

  function renderChart() {
    if (manualScatter) {
      const groups = [...new Set(manualScatter.points.map(point => point.group).filter((value): value is string => !!value))]
      const traces = groups.length > 0
        ? groups.map((group, index) => {
            const points = manualScatter.points.filter(point => point.group === group)
            return {
              type: 'scatter' as const,
              mode: 'markers' as const,
              name: group,
              x: points.map(point => point.x),
              y: points.map(point => point.y),
              marker: {
                color: points[0]?.color ?? ABRA_COLORS[index % ABRA_COLORS.length],
                size: 7,
                opacity: 0.9,
                line: { width: 0 },
              },
              hovertemplate: `${manualScatter.xName}: %{x}<br>${manualScatter.yName}: %{y}<extra>${group}</extra>`,
            }
          })
        : [{
            type: 'scatter' as const,
            mode: 'markers' as const,
            x: manualScatter.points.map(point => point.x),
            y: manualScatter.points.map(point => point.y),
            marker: { color: ABRA_COLORS[0], size: 7, opacity: 0.9, line: { width: 0 } },
            hovertemplate: `${manualScatter.xName}: %{x}<br>${manualScatter.yName}: %{y}<extra></extra>`,
          }]

      return (
        <PlotlyChart
          data={traces as Data[]}
          layout={{
            xaxis: { title: { text: '' } },
            yaxis: { title: { text: '' }, zeroline: manualScatter.yName === 'Residual', zerolinecolor: '#94A3B8', zerolinewidth: 1.5 },
            margin: { t: 12, r: 16, b: 44, l: 52 },
            showlegend: groups.length > 0,
            shapes: manualScatter.yName === 'Residual'
              ? [{
                  type: 'line',
                  xref: 'paper',
                  yref: 'y',
                  x0: 0,
                  x1: 1,
                  y0: 0,
                  y1: 0,
                  line: { color: '#94A3B8', width: 1.5, dash: 'dot' },
                }]
              : [],
          }}
        />
      )
    }

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
      const groupedDistributionOrientation = hasCategoricalGrouping ? 'h' : 'v'
      switch (currentChart) {
        case 'histogram':  return <Histogram colId={config.yColId} groupColId={config.groupColId} orientation={groupedDistributionOrientation} />
        case 'dot':        return <DotPlot colId={config.yColId} groupByColId={config.groupColId} orientation={groupedDistributionOrientation} />
        case 'box':        return <BoxPlot colId={config.yColId} groupColId={config.groupColId} orientation={groupedDistributionOrientation} />
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
      case 'scatter':    return <ScatterPlot xColId={config.xColId} yColId={config.yColId} colorByColId={config.groupColId} bestFitMode={bestFitMode} />
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
  const isManualScatter = !!manualScatter

  useEffect(() => {
    const prev = prevMorphSpecRef.current
    if (morphSpec && prev && JSON.stringify(prev) !== JSON.stringify(morphSpec)) {
      setActiveTransition({ from: prev, to: morphSpec, nonce: Date.now() })
    }
    prevMorphSpecRef.current = morphSpec
  }, [morphSpec])

  const useAnimatedScatter = morphSpec?.kind === 'scatter' && bestFitMode !== 'group'

  // dot and scatter stay in the custom-rendered AnimatedCaseLayer permanently,
  // except grouped best-fit scatter, which needs the full Plotly renderer.
  const isCustomRendered =
    morphSpec !== null &&
    (morphSpec.kind === 'dot' || useAnimatedScatter)

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
          {!manualTable && !manualScatter && chartButtons.length > 0 && (
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
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] whitespace-nowrap ml-1">
              <span>Best-fit line:</span>
              <select
                value={bestFitMode}
                onChange={e => setBestFitMode(e.target.value as 'none' | 'overall' | 'group')}
                className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text)]"
              >
                <option value="none">None</option>
                <option value="overall">Overall</option>
                {groupCol?.type === 'categorical' && <option value="group">By group</option>}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 flex-wrap justify-end">
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <span className="whitespace-nowrap">Title</span>
            <input
              type="text"
              value={config.title ?? ''}
              onChange={e => onSetTitle(e.target.value)}
              placeholder="optional"
              className="w-40 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs text-[var(--color-text)]"
            />
          </label>
          <button
            onClick={handleCopyGraph}
            disabled={isBlank || isCopying}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCopying ? 'Copying…' : 'Copy Graph'}
          </button>
          {!usesAxisGrouping && !isManualSegmented && !isManualScatter && (
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
      </div>

      {/*
        Spatial grid layout:
          col 1 (36px): Response Variable zone  — same height as chart rectangle
          col 2 (1fr):  chart rectangle          — fills remaining space
          row 2 col 2:  Explanatory Variable     — same width as chart rectangle
      */}
      {isManualSegmented || isManualScatter ? (
        <div ref={graphExportRef} className="flex-1 min-h-0 rounded-xl overflow-hidden bg-white flex flex-col">
          {!!config.title?.trim() && (
            <div className="flex-shrink-0 px-4 pt-2 text-center text-sm font-semibold text-[var(--color-muted)]">
              {config.title.trim()}
            </div>
          )}
          <div className="flex-1 min-h-0" data-graph-plot-area="true">
            <GraphCardContext.Provider value={{ hideAxisTitles: true }}>
              {renderChart()}
            </GraphCardContext.Provider>
          </div>
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
          <div ref={graphExportRef} className="h-full min-h-[180px] bg-white flex flex-col">
            {!!config.title?.trim() && !isBlank && (
              <div className="flex-shrink-0 px-4 pt-2 text-center text-sm font-semibold text-[var(--color-muted)]">
                {config.title.trim()}
              </div>
            )}
            <div className="flex-1 min-h-0" data-graph-plot-area="true">
          {showAnimatedBlank ? (
            <AnimatedCaseLayer key="stable" spec={morphSpec!} showHint hideAxisTitles />
          ) : showAnimatedTransition ? (
            <AnimatedCaseLayer
              key={activeTransition!.nonce}
              spec={activeTransition!.to}
              fromSpec={activeTransition!.from}
              showBestFitLine={activeTransition!.to.kind === 'scatter' ? bestFitMode === 'overall' : false}
              hideAxisTitles
              onRest={() => setActiveTransition(null)}
            />
          ) : showSettledCustom ? (
            <AnimatedCaseLayer key="stable" spec={morphSpec!} showBestFitLine={morphSpec!.kind === 'scatter' ? bestFitMode === 'overall' : false} hideAxisTitles />
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
          </div>
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
