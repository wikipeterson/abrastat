'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useDraggable } from '@dnd-kit/core'
import { useStore } from '@/lib/store'
import { GridColumn } from '@/types'
import { CardConfig, GraphCardConfig, ExploreCard } from '@/lib/exploreTypes'
import { ChartType, inferCharts } from '@/lib/chartHelpers'
import { GraphCard } from './cards/GraphCard'
import { SummaryCard } from './cards/SummaryCard'
import { RegressionCard } from './cards/RegressionCard'
import { TwoWayTable } from '@/components/applets/TwoWayTable'
import { DistributionCard } from '@/components/inference/DistributionCard'
import { EmptyState } from '@/components/ui/EmptyState'

// ─── Draggable variable chip (sidebar) ────────────────────────────────────────

function DraggableChip({ col }: { col: GridColumn }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `col:${col.id}`,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium
        cursor-grab active:cursor-grabbing select-none transition-opacity
        ${col.type === 'numeric'
          ? 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
          : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
        }
        ${isDragging ? 'opacity-25' : 'opacity-100'}
      `}
    >
      <span className="text-[10px] font-mono font-bold opacity-50">{col.type === 'numeric' ? '#' : 'A'}</span>
      <span className="truncate">{col.name}</span>
    </div>
  )
}

function GhostChip({ col }: { col: GridColumn }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium shadow-lg rotate-1 cursor-grabbing">
      <span className="opacity-70 text-xs font-mono">{col.type === 'numeric' ? '#' : 'A'}</span>
      <span>{col.name}</span>
    </div>
  )
}

// ─── Card label ───────────────────────────────────────────────────────────────

function cardLabel(type: CardConfig['type']): string {
  switch (type) {
    case 'graph':        return 'Graph'
    case 'summary':      return 'Summary Statistics'
    case 'table':        return 'Two-Way Table'
    case 'regression':   return 'Regression'
    case 'distribution': return 'Distribution'
    case 'generator':    return 'Random Generator'
    case 'testinterval': return 'Test / Interval'
    case 'simulation':   return 'Simulation'
    default:             return 'Card'
  }
}

// ─── Placeholder for unimplemented card types ─────────────────────────────────

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
      <span className="text-4xl opacity-20 select-none">🚧</span>
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{label}</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">Coming soon</p>
      </div>
    </div>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export function ExploreCanvas() {
  const {
    grid,
    exploreCards, removeExploreCard, updateExploreCard, purgeExploreStaleIds,
  } = useStore()

  const cards = exploreCards
  const removeCard = removeExploreCard
  const updateCard = updateExploreCard

  const [activeColId, setActiveColId] = useState<string | null>(null)
  const [interactionCursor, setInteractionCursor] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)

  const BASE_CANVAS_WIDTH = 1400
  const BASE_CANVAS_HEIGHT = 1800
  const MIN_ZOOM = 0.6
  const MAX_ZOOM = 1.8
  const ZOOM_STEP = 0.1

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const hasData = grid.rows.some(r => Object.values(r).some(v => String(v).trim()))

  // Clear stale column IDs when columns change
  useEffect(() => {
    const validIds = new Set(grid.columns.map(c => c.id))
    purgeExploreStaleIds(validIds)
  }, [grid.columns, purgeExploreStaleIds])

  useEffect(() => {
    if (!interactionCursor) return
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    document.body.style.cursor = interactionCursor
    return () => {
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      document.body.style.cursor = ''
    }
  }, [interactionCursor])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('col:')) {
      setActiveColId(id.slice(4))
    } else if (id.startsWith('zc:')) {
      setActiveColId(event.active.data.current?.colId ?? null)
    } else {
      setActiveColId(null)
    }
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveColId(null)
    if (!event.over) return
    const activeId = String(event.active.id)
    const overId = String(event.over.id)

    let colId: string
    let sourceZoneId: string | null = null

    if (activeId.startsWith('col:')) {
      colId = activeId.slice(4)
    } else if (activeId.startsWith('zc:')) {
      colId = event.active.data.current?.colId
      sourceZoneId = event.active.data.current?.sourceZoneId ?? null
      if (!colId) return
    } else {
      return
    }

    const colonIdx = overId.indexOf(':')
    if (colonIdx === -1) return
    const cardId = overId.slice(0, colonIdx)
    const zone = overId.slice(colonIdx + 1)

    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const cfg = card.config

    // Only graph, regression, and summary cards have drop zones
    if (cfg.type !== 'graph' && cfg.type !== 'summary' && cfg.type !== 'regression') return

    const sourceZone = (sourceZoneId && sourceZoneId.startsWith(cardId + ':'))
      ? sourceZoneId.slice(cardId.length + 1)
      : null

    const targetZone = zone === 'canvas' ? 'x' : zone

    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      let c = { ...cfg }
      if (targetZone === 'x')     c = { ...c, xColId: colId }
      if (targetZone === 'y')     c = { ...c, yColId: colId }
      if (targetZone === 'group') c = { ...c, groupColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x')     c = { ...c, xColId: null }
        if (sourceZone === 'y')     c = { ...c, yColId: null }
        if (sourceZone === 'group') c = { ...c, groupColId: null }
      }

      const nextXCol     = c.xColId     ? (grid.columns.find(col => col.id === c.xColId) ?? null)     : null
      const nextYCol     = c.yColId     ? (grid.columns.find(col => col.id === c.yColId) ?? null)     : null
      const nextGroupCol = c.groupColId ? (grid.columns.find(col => col.id === c.groupColId) ?? null) : null
      const { primary, alternatives } = inferCharts(
        nextXCol?.type ?? null,
        nextYCol?.type ?? null,
        nextGroupCol?.type ?? null,
      )
      const validChartTypes = primary ? [primary, ...alternatives] : []
      if (!c.chartType || (validChartTypes.length > 0 && !validChartTypes.includes(c.chartType))) {
        c = { ...c, chartType: primary }
      }
      newConfig = c
    }
    if (cfg.type === 'summary') {
      if (zone === 'variable') {
        const ids = cfg.variableColIds.includes(colId) ? cfg.variableColIds : [...cfg.variableColIds, colId]
        newConfig = { ...cfg, variableColIds: ids }
      }
      if (zone === 'group') newConfig = { ...cfg, groupColId: colId }
    }
    if (cfg.type === 'regression') {
      let c = { ...cfg }
      if (targetZone === 'x') c = { ...c, xColId: colId }
      if (targetZone === 'y') c = { ...c, yColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x') c = { ...c, xColId: null }
        if (sourceZone === 'y') c = { ...c, yColId: null }
      }
      newConfig = c
    }
    if (newConfig) updateCard(cardId, { config: newConfig })
  }, [cards, grid.columns, updateCard])

  function clearZone(cardId: string, zone: string) {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const cfg = card.config
    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      if (zone === 'x')     newConfig = { ...cfg, xColId: null }
      if (zone === 'y')     newConfig = { ...cfg, yColId: null }
      if (zone === 'group') newConfig = { ...cfg, groupColId: null }
    }
    if (cfg.type === 'summary') {
      if (zone === 'group') newConfig = { ...cfg, groupColId: null }
      if (zone.startsWith('variable:')) {
        const removeId = zone.slice('variable:'.length)
        newConfig = { ...cfg, variableColIds: cfg.variableColIds.filter(id => id !== removeId) }
      }
    }
    if (cfg.type === 'regression') {
      if (zone === 'x') newConfig = { ...cfg, xColId: null }
      if (zone === 'y') newConfig = { ...cfg, yColId: null }
    }
    if (newConfig) updateCard(cardId, { config: newConfig })
  }

  // ─── Card movement ─────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, cardId: string) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const startX = e.clientX, startY = e.clientY
    const startCardX = card.x, startCardY = card.y
    setInteractionCursor('grabbing')

    function onMove(ev: PointerEvent) {
      updateCard(cardId, {
        x: Math.max(0, startCardX + (ev.clientX - startX) / zoomRef.current),
        y: Math.max(0, startCardY + (ev.clientY - startY) / zoomRef.current),
      })
    }
    function onUp() {
      setInteractionCursor(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ─── Card resize ──────────────────────────────────────────────────────────
  function getCardMinSize(card: ExploreCard) {
    switch (card.config.type) {
      case 'graph':        return { minWidth: 520, minHeight: 460 }
      case 'summary':      return { minWidth: 700, minHeight: 620 }
      case 'table':        return { minWidth: 780, minHeight: 500 }
      case 'regression':   return { minWidth: 400, minHeight: 340 }
      case 'distribution': return { minWidth: 460, minHeight: 480 }
      default:             return { minWidth: 360, minHeight: 280 }
    }
  }

  function startResize(e: React.PointerEvent, cardId: string, dir: 'e' | 's' | 'se') {
    e.preventDefault()
    e.stopPropagation()
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const { minWidth, minHeight } = getCardMinSize(card)
    const startX = e.clientX, startY = e.clientY
    const startW = card.width, startH = card.height ?? 520
    const cursor = dir === 'e' ? 'ew-resize' : dir === 's' ? 'ns-resize' : 'nwse-resize'
    setInteractionCursor(cursor)

    function onMove(ev: PointerEvent) {
      const updates: Partial<Omit<ExploreCard, 'id'>> = {}
      if (dir === 'e' || dir === 'se') updates.width  = Math.max(minWidth, startW + (ev.clientX - startX) / zoomRef.current)
      if (dir === 's' || dir === 'se') updates.height = Math.max(minHeight, startH + (ev.clientY - startY) / zoomRef.current)
      updateCard(cardId, updates)
    }
    function onUp() {
      setInteractionCursor(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startPan(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (
      target.closest('[data-card-id]') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('label') ||
      target.closest('a')
    ) {
      return
    }

    const scroller = scrollRef.current
    if (!scroller) return
    const scrollerEl: HTMLDivElement = scroller

    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = scrollerEl.scrollLeft
    const startTop = scrollerEl.scrollTop
    setInteractionCursor('grabbing')

    function onMove(ev: PointerEvent) {
      scrollerEl.scrollLeft = startLeft - (ev.clientX - startX)
      scrollerEl.scrollTop = startTop - (ev.clientY - startY)
    }

    function onUp() {
      setInteractionCursor(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function applyZoom(nextZoom: number, origin?: { clientX: number; clientY: number }) {
    const scroller = scrollRef.current
    if (!scroller) {
      setZoom(nextZoom)
      return
    }

    const rect = scroller.getBoundingClientRect()
    const originX = origin?.clientX ?? rect.left + rect.width / 2
    const originY = origin?.clientY ?? rect.top + rect.height / 2
    const localX = originX - rect.left
    const localY = originY - rect.top
    const currentZoom = zoomRef.current
    const worldX = (scroller.scrollLeft + localX) / currentZoom
    const worldY = (scroller.scrollTop + localY) / currentZoom

    setZoom(nextZoom)

    requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(0, worldX * nextZoom - localX)
      scroller.scrollTop = Math.max(0, worldY * nextZoom - localY)
    })
  }

  function nudgeZoom(direction: 1 | -1) {
    const current = zoomRef.current
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat((current + direction * ZOOM_STEP).toFixed(2))))
    if (nextZoom !== current) applyZoom(nextZoom)
  }

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const current = zoomRef.current
    const rawNext = current * (e.deltaY < 0 ? 1.1 : 0.9)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat(rawNext.toFixed(3))))
    if (nextZoom !== current) applyZoom(nextZoom, { clientX: e.clientX, clientY: e.clientY })
  }

  const activeCol = activeColId ? (grid.columns.find(c => c.id === activeColId) ?? null) : null

  if (!hasData) {
    return (
      <div className="flex h-full min-h-0">
        <aside className="w-48 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2">
            <p className="text-xs text-[var(--color-muted)] px-1 py-2">No data loaded</p>
          </div>
        </aside>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon="📈" title="No data loaded" description="Add data in the Data tab to start exploring." />
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0">

        {/* Variable sidebar */}
        <aside className="w-48 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
            {grid.columns.map(col => (
              <DraggableChip key={col.id} col={col} />
            ))}
          </div>
        </aside>

        {/* Canvas column */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div ref={scrollRef} onWheel={handleWheel} className="flex-1 overflow-auto bg-[var(--color-bg)] p-2 relative cursor-grab">
            {cards.length === 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="text-center px-6">
                  <div className="text-4xl mb-3 opacity-30">✦</div>
                  <p className="text-[var(--color-muted)] text-sm">Use <strong>Add Card</strong> to get started</p>
                </div>
              </div>
            )}
            <div
              ref={innerRef}
              onPointerDown={startPan}
              className="relative rounded-lg"
              style={{ width: BASE_CANVAS_WIDTH * zoom, minWidth: BASE_CANVAS_WIDTH * zoom, height: BASE_CANVAS_HEIGHT * zoom, minHeight: BASE_CANVAS_HEIGHT * zoom }}
            >
              {cards.map(card => {
                const cardH = card.height ?? 520
                return (
                  <div
                    key={card.id}
                    data-card-id={card.id}
                    style={{
                      position: 'absolute',
                      left: card.x * zoom,
                      top: card.y * zoom,
                      width: card.width * zoom,
                      height: cardH * zoom,
                    }}
                    className="group"
                  >
                    <div className="relative h-full bg-white rounded-2xl shadow-sm border border-slate-100">

                      {/* Inner clip layer */}
                      <div className="absolute inset-0 rounded-2xl overflow-hidden flex flex-col">
                        {/* Move handle */}
                        <div
                          onPointerDown={e => startMove(e, card.id)}
                          className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] cursor-grab active:cursor-grabbing select-none"
                        >
                          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                            {cardLabel(card.config.type)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 text-xs select-none opacity-0 group-hover:opacity-100 transition-opacity">⠿ drag to move</span>
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => removeCard(card.id)}
                              className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Card content */}
                        <div className="flex-1 min-h-0 overflow-hidden p-4">
                          {card.config.type === 'graph' && (
                            <GraphCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onSetChartType={(ct: ChartType) => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), chartType: ct } })}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'summary' && (
                            <SummaryCard cardId={card.id} config={card.config} onClearZone={z => clearZone(card.id, z)} onRemove={() => removeCard(card.id)} hideHeader />
                          )}
                          {card.config.type === 'table' && (
                            <div className="h-full overflow-auto">
                              <TwoWayTable />
                            </div>
                          )}
                          {card.config.type === 'regression' && (
                            <RegressionCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'distribution' && (
                            <DistributionCard preFill={card.config.preFill} />
                          )}
                          {card.config.type === 'testinterval' && (
                            <PlaceholderCard label="Test / Interval" />
                          )}
                          {card.config.type === 'simulation' && (
                            <PlaceholderCard label="Simulation" />
                          )}
                        </div>
                      </div>

                      {/* Right-edge resize handle */}
                      <div
                        onPointerDown={e => startResize(e, card.id, 'e')}
                        className="absolute top-0 w-3 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ right: -5 }}
                      >
                        <div className="absolute top-1/2 -translate-y-1/2 left-0.5 w-1.5 h-8 bg-slate-300 rounded-full" />
                      </div>

                      {/* Bottom-edge resize handle */}
                      <div
                        onPointerDown={e => startResize(e, card.id, 's')}
                        className="absolute left-0 h-3 w-full cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ bottom: -5 }}
                      >
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 h-1.5 w-8 bg-slate-300 rounded-full" />
                      </div>

                      {/* SE corner resize handle */}
                      <div
                        onPointerDown={e => startResize(e, card.id, 'se')}
                        className="absolute w-5 h-5 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end"
                        style={{ right: -5, bottom: -5 }}
                      >
                        <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="absolute bottom-4 left-4 z-20 flex items-center rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm overflow-hidden">
              <button
                type="button"
                onClick={() => nudgeZoom(-1)}
                disabled={zoom <= MIN_ZOOM}
                className="h-10 w-10 text-xl text-[var(--color-text)] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Zoom out"
              >
                −
              </button>
              <div className="min-w-16 px-3 text-center text-xs font-medium text-[var(--color-muted)] border-x border-slate-200">
                {Math.round(zoom * 100)}%
              </div>
              <button
                type="button"
                onClick={() => nudgeZoom(1)}
                disabled={zoom >= MAX_ZOOM}
                className="h-10 w-10 text-xl text-[var(--color-text)] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCol && <GhostChip col={activeCol} />}
      </DragOverlay>
    </DndContext>
  )
}
