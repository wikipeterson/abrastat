'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useStore } from '@/lib/store'
import { GridColumn } from '@/types'
import { CardConfig, GraphCardConfig, MeansCardConfig, ExploreCard, ManualTwoWayTableSnapshot } from '@/lib/exploreTypes'
import { ChartType, inferCharts } from '@/lib/chartHelpers'
import { SwapAnimContext, SwapAnimState } from '@/lib/swapAnimContext'
import { GraphCard } from './cards/GraphCard'
import { SummaryCard } from './cards/SummaryCard'
import { RegressionCard } from './cards/RegressionCard'
import { TableCard } from './cards/TableCard'
import { TwoWayTable } from '@/components/applets/TwoWayTable'
import { DistributionCard } from '@/components/inference/DistributionCard'
import { MeansCard } from '@/components/inference/MeansCard'
import { RandomGeneratorCard } from '@/components/probability/RandomGeneratorCard'
import { DiceRollerCard } from '@/components/probability/DiceRollerCard'
import { SimResultsCard } from '@/components/probability/SimResultsCard'
import { GridToolbar } from '@/components/grid/GridToolbar'
import { DataGrid } from '@/components/grid/DataGrid'

interface CardOption {
  type: CardConfig['type']
  icon: string
  label: string
}

const EXPLORE_CARD_OPTIONS: CardOption[] = [
  { type: 'graph', icon: '📈', label: 'Graph' },
  { type: 'summary', icon: '📊', label: 'Summary Statistics' },
  { type: 'table', icon: '⊞', label: 'Two-Way Table' },
  { type: 'regression', icon: '📉', label: 'Regression' },
]

const PROBABILITY_CARD_OPTIONS: CardOption[] = [
  { type: 'distribution', icon: '🔔', label: 'Distribution' },
  { type: 'generator', icon: '🎛️', label: 'Random Generator' },
  { type: 'dice-roller', icon: '🎲', label: 'Dice Roller' },
  { type: 'simulation', icon: '🔀', label: 'Simulation' },
]

const INFERENCE_CARD_OPTIONS: CardOption[] = [
  { type: 'means', icon: '📐', label: 'Means' },
  { type: 'testinterval', icon: '⚖️', label: 'Test / Interval' },
]

const CARD_OPTION_GROUPS = [
  { id: 'explore', label: 'Explore', options: EXPLORE_CARD_OPTIONS },
  { id: 'probability', label: 'Probability', options: PROBABILITY_CARD_OPTIONS },
  { id: 'inference', label: 'Inference', options: INFERENCE_CARD_OPTIONS },
] as const

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
    case 'data-grid':    return 'Data Grid'
    case 'graph':        return 'Graph'
    case 'summary':      return 'Summary Statistics'
    case 'table':        return 'Two-Way Table'
    case 'table-output': return 'Two-Way Table'
    case 'regression':   return 'Regression'
    case 'distribution': return 'Distribution'
    case 'generator':    return 'Random Generator'
    case 'dice-roller':  return 'Dice Roller'
    case 'sim-results':   return 'Roll Results'
    case 'testinterval': return 'Test / Interval'
    case 'simulation':   return 'Simulation'
    case 'means':        return 'Means'
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

function WorkspaceContextMenu({
  x,
  y,
  onAdd,
  onClose,
}: {
  x: number
  y: number
  onAdd: (type: CardConfig['type']) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-[100] w-[280px] rounded-2xl border border-slate-100 bg-white shadow-xl overflow-hidden"
        style={{ left: x, top: y }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Plus size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold text-[var(--color-text)]">Add Card</span>
        </div>
        {CARD_OPTION_GROUPS.map(group => (
          <div key={group.id} className="border-b border-[var(--color-border)] last:border-b-0">
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {group.label}
            </div>
            <div className="pb-2">
              {group.options.map(option => (
                <button
                  key={option.type}
                  onClick={() => onAdd(option.type)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="text-base leading-none">{option.icon}</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export function ExploreCanvas({ onShareDataset }: { onShareDataset?: () => void }) {
  const {
    grid, addExploreCard,
    exploreCards, removeExploreCard, updateExploreCard, purgeExploreStaleIds, ensureDataGridCard, addLinkedGraphCard, addLinkedTableCard,
  } = useStore()

  const cards = exploreCards
  const removeCard = removeExploreCard
  const updateCard = updateExploreCard

  const [activeColId, setActiveColId] = useState<string | null>(null)
  const [swapAnim, setSwapAnim] = useState<SwapAnimState | null>(null)
  const [interactionCursor, setInteractionCursor] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [contextMenu, setContextMenu] = useState<{
    screenX: number
    screenY: number
    worldX: number
    worldY: number
  } | null>(null)
  const [tableInputModes, setTableInputModes] = useState<Record<string, 'raw' | 'manual'>>({})
  const [tableManualSnapshots, setTableManualSnapshots] = useState<Record<string, ManualTwoWayTableSnapshot | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  // Stable ref so the column-change effect can read latest cards without
  // cards being in its dependency array (which would cause an update loop).
  const cardsRef = useRef(cards)
  useLayoutEffect(() => { cardsRef.current = cards })

  const BASE_CANVAS_WIDTH = 2200
  const BASE_CANVAS_HEIGHT = 1800
  const MIN_ZOOM = 0.6
  const MAX_ZOOM = 1.8

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    ensureDataGridCard()
  }, [ensureDataGridCard])

  useEffect(() => {
    const dataGridCard = cards.find(card => card.config.type === 'data-grid')
    if (!dataGridCard) return
    const desiredWidth = Math.max(
      620,
      48 + grid.columns.reduce((sum, col) => sum + (col.width ?? 140), 0) + 32,
    )
    if (dataGridCard.width < desiredWidth) {
      updateCard(dataGridCard.id, { width: desiredWidth })
    }
  }, [cards, grid.columns, updateCard])

  const normalizeGraphConfig = useCallback((cfg: GraphCardConfig): GraphCardConfig => {
    const xType = cfg.xColId ? (grid.columns.find(c => c.id === cfg.xColId)?.type ?? null) : null
    const yType = cfg.yColId ? (grid.columns.find(c => c.id === cfg.yColId)?.type ?? null) : null
    const usesAxisGrouping =
      (xType === 'numeric' && yType === 'categorical') ||
      (xType === 'categorical' && yType === 'numeric')
    const normalizedGroupColId = usesAxisGrouping ? null : cfg.groupColId
    const groupType = normalizedGroupColId ? (grid.columns.find(c => c.id === normalizedGroupColId)?.type ?? null) : null
    const { primary, alternatives } = inferCharts(xType, yType, groupType)
    const valid = primary ? [primary, ...alternatives] : []
    const baseCfg = usesAxisGrouping && cfg.groupColId !== null
      ? { ...cfg, groupColId: null }
      : cfg

    if (!baseCfg.chartType) {
      return { ...baseCfg, chartType: primary }
    }
    if (valid.length > 0 && !valid.includes(baseCfg.chartType)) {
      return { ...baseCfg, chartType: primary }
    }
    if (valid.length === 0 && baseCfg.chartType) {
      return { ...baseCfg, chartType: null }
    }
    return baseCfg
  }, [grid.columns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // When columns change (including type toggles): purge stale IDs and
  // re-infer chart types for any graph card whose current type is no longer valid.
  useEffect(() => {
    const validIds = new Set(grid.columns.map(c => c.id))
    purgeExploreStaleIds(validIds)

      const colMap = new Map(grid.columns.map(c => [c.id, c]))
    cardsRef.current.forEach(card => {
      if (card.config.type !== 'graph') return
      const cfg = card.config
      const normalized = normalizeGraphConfig({
        ...cfg,
        xColId: cfg.xColId && colMap.has(cfg.xColId) ? cfg.xColId : null,
        yColId: cfg.yColId && colMap.has(cfg.yColId) ? cfg.yColId : null,
        groupColId: cfg.groupColId && colMap.has(cfg.groupColId) ? cfg.groupColId : null,
      })
      if (
        normalized.xColId !== cfg.xColId ||
        normalized.yColId !== cfg.yColId ||
        normalized.groupColId !== cfg.groupColId ||
        normalized.chartType !== cfg.chartType
      ) {
        updateCard(card.id, { config: normalized })
      }
    })
  }, [grid.columns, normalizeGraphConfig, purgeExploreStaleIds, updateCard])

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

    // Only these card types have drop zones
    if (cfg.type !== 'graph' && cfg.type !== 'summary' && cfg.type !== 'regression' && cfg.type !== 'means' && cfg.type !== 'table') return

    const sourceZone = (sourceZoneId && sourceZoneId.startsWith(cardId + ':'))
      ? sourceZoneId.slice(cardId.length + 1)
      : null

    const targetZone = zone === 'canvas' ? 'x' : zone

    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      let c = { ...cfg }
      const prevX = c.xColId
      const prevY = c.yColId
      const prevGroup = c.groupColId
      if (targetZone === 'x')     c = { ...c, xColId: colId }
      if (targetZone === 'y')     c = { ...c, yColId: colId }
      if (targetZone === 'group') c = { ...c, groupColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x')     c = { ...c, xColId: targetZone === 'y' ? prevY : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'y')     c = { ...c, yColId: targetZone === 'x' ? prevX : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'group') c = { ...c, groupColId: targetZone === 'x' ? prevX : targetZone === 'y' ? prevY : null }
      }

      newConfig = normalizeGraphConfig(c)
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
      const prevX = c.xColId
      const prevY = c.yColId
      if (targetZone === 'x') c = { ...c, xColId: colId }
      if (targetZone === 'y') c = { ...c, yColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x') c = { ...c, xColId: targetZone === 'y' ? prevY : null }
        if (sourceZone === 'y') c = { ...c, yColId: targetZone === 'x' ? prevX : null }
      }
      newConfig = c
    }
    if (cfg.type === 'table') {
      let c = { ...cfg }
      const prevRows = c.rowsColId
      const prevCols = c.colsColId
      if (targetZone === 'rows') c = { ...c, rowsColId: colId }
      if (targetZone === 'cols') c = { ...c, colsColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'rows') c = { ...c, rowsColId: targetZone === 'cols' ? prevCols : null }
        if (sourceZone === 'cols') c = { ...c, colsColId: targetZone === 'rows' ? prevRows : null }
      }
      newConfig = c
    }
    if (cfg.type === 'means') {
      const droppedCol = grid.columns.find(c => c.id === colId)
      if (!droppedCol) return
      // var1 must be numeric; var2 can be numeric or categorical
      if (targetZone === 'var1' && droppedCol.type !== 'numeric') return
      let c: MeansCardConfig = { ...cfg }
      const prevVar1 = c.var1ColId
      const prevVar2 = c.var2ColId
      if (targetZone === 'var1') c = { ...c, var1ColId: colId }
      if (targetZone === 'var2') c = { ...c, var2ColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'var1') c = { ...c, var1ColId: targetZone === 'var2' ? prevVar2 : null }
        if (sourceZone === 'var2') c = { ...c, var2ColId: targetZone === 'var1' ? prevVar1 : null }
      }
      newConfig = c
    }
    if (newConfig) {
      // When two occupied zones swap, animate the displaced chip into its new zone
      if (sourceZone && sourceZone !== targetZone) {
        // Zone left-to-right order per card type; used to infer the arrival direction
        const ZONE_ORDER: Record<string, string[]> = {
          graph:      ['x', 'y', 'group'],
          regression: ['x', 'y'],
          means:      ['var1', 'var2'],
          table:      ['rows', 'cols'],
        }
        const order = ZONE_ORDER[cfg.type] ?? []
        const tIdx = order.indexOf(targetZone)
        const sIdx = order.indexOf(sourceZone)
        // Graph's Y-axis uses a vertical chip layout — use a scale-pop instead of a slide
        const isVertZone = cfg.type === 'graph' && sourceZone === 'y'
        const direction: SwapAnimState['direction'] =
          (!isVertZone && tIdx !== -1 && sIdx !== -1)
            ? (tIdx > sIdx ? 'from-right' : 'from-left')
            : 'pop'
        setSwapAnim({ zoneId: `${cardId}:${sourceZone}`, direction })
        setTimeout(() => setSwapAnim(null), 300)
      }
      updateCard(cardId, { config: newConfig })
    }
  }, [cards, grid.columns, normalizeGraphConfig, updateCard])

  function clearZone(cardId: string, zone: string) {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const cfg = card.config
    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      if (zone === 'x')     newConfig = normalizeGraphConfig({ ...cfg, xColId: null })
      if (zone === 'y')     newConfig = normalizeGraphConfig({ ...cfg, yColId: null })
      if (zone === 'group') newConfig = normalizeGraphConfig({ ...cfg, groupColId: null })
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
    if (cfg.type === 'table') {
      if (zone === 'rows') newConfig = { ...cfg, rowsColId: null }
      if (zone === 'cols') newConfig = { ...cfg, colsColId: null }
    }
    if (cfg.type === 'means') {
      if (zone === 'var1') newConfig = { ...cfg, var1ColId: null }
      if (zone === 'var2') newConfig = { ...cfg, var2ColId: null }
    }
    if (newConfig) updateCard(cardId, { config: newConfig })
  }

  function assignGraphZone(cardId: string, zone: 'x' | 'y' | 'group', colId: string) {
    const card = cards.find(c => c.id === cardId)
    if (!card || card.config.type !== 'graph') return
    let next: GraphCardConfig = { ...card.config }
    if (zone === 'x') next = { ...next, xColId: colId }
    if (zone === 'y') next = { ...next, yColId: colId }
    if (zone === 'group') next = { ...next, groupColId: colId }
    updateCard(cardId, { config: normalizeGraphConfig(next) })
  }

  // ─── Card movement ─────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, cardId: string) {
    if (e.button !== 0) return
    setContextMenu(null)
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
      case 'data-grid':    return { minWidth: 420, minHeight: 620 }
      case 'graph':        return { minWidth: 520, minHeight: 460 }
      case 'summary':      return { minWidth: 700, minHeight: 620 }
      case 'table':        return { minWidth: 920, minHeight: 700 }
      case 'regression':   return { minWidth: 400, minHeight: 340 }
      case 'distribution': return { minWidth: 460, minHeight: 480 }
      case 'generator':    return { minWidth: 460, minHeight: 440 }
      case 'dice-roller':  return { minWidth: 760, minHeight: 700 }
      case 'sim-results':  return { minWidth: 360, minHeight: 360 }
      case 'means':        return { minWidth: 520, minHeight: 520 }
      default:             return { minWidth: 360, minHeight: 280 }
    }
  }

  function startResize(e: React.PointerEvent, cardId: string, dir: 'e' | 's' | 'se') {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
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
    setContextMenu(null)
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

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const current = zoomRef.current
    const rawNext = current * (e.deltaY < 0 ? 1.1 : 0.9)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat(rawNext.toFixed(3))))
    if (nextZoom !== current) applyZoom(nextZoom, { clientX: e.clientX, clientY: e.clientY })
  }

  function handleWorkspaceContextMenu(e: React.MouseEvent<HTMLDivElement>) {
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

    e.preventDefault()
    const inner = innerRef.current
    if (!inner) return
    const rect = inner.getBoundingClientRect()
    const worldX = Math.max(0, (e.clientX - rect.left) / zoomRef.current)
    const worldY = Math.max(0, (e.clientY - rect.top) / zoomRef.current)
    setContextMenu({
      screenX: Math.min(window.innerWidth - 300, e.clientX),
      screenY: Math.min(window.innerHeight - 420, e.clientY),
      worldX,
      worldY,
    })
  }

  function handleContextAdd(type: CardConfig['type']) {
    if (!contextMenu) return
    addExploreCard(type, { x: contextMenu.worldX, y: contextMenu.worldY })
    setContextMenu(null)
  }

  const activeCol = activeColId ? (grid.columns.find(c => c.id === activeColId) ?? null) : null
  const filledRowCount = grid.rows.filter(row => Object.values(row).some(v => String(v).trim())).length
  const columnCount = grid.columns.length
  const MINIMIZED_HEIGHT = 62

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SwapAnimContext.Provider value={swapAnim}>
      <div className="flex h-full min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div
            ref={scrollRef}
            onWheel={handleWheel}
            onContextMenu={handleWorkspaceContextMenu}
            className="flex-1 overflow-auto bg-[var(--color-bg)] p-2 relative cursor-grab"
          >
            <div
              ref={innerRef}
              onPointerDown={startPan}
              className="relative rounded-lg"
              style={{ width: BASE_CANVAS_WIDTH * zoom, minWidth: BASE_CANVAS_WIDTH * zoom, height: BASE_CANVAS_HEIGHT * zoom, minHeight: BASE_CANVAS_HEIGHT * zoom }}
            >
              {cards.map(card => {
                const cardH = card.height ?? 520
                const isMinimized = !!card.minimized
                const displayHeight = isMinimized ? MINIMIZED_HEIGHT : cardH
                return (
                  <div
                    key={card.id}
                    data-card-id={card.id}
                    style={{
                      position: 'absolute',
                      left: card.x * zoom,
                      top: card.y * zoom,
                      width: card.width * zoom,
                      height: displayHeight * zoom,
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
                          <div className="min-w-0 flex items-center gap-3">
                            <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                              {cardLabel(card.config.type)}
                            </span>
                            {card.config.type === 'data-grid' && (
                              <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">
                                {filledRowCount} rows {columnCount} columns
                              </span>
                            )}
                            {card.config.type === 'table' && (() => {
                              const tableConfig = card.config
                              return (
                              <>
                                <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden bg-white">
                                  {(['raw', 'manual'] as const).map(mode => (
                                    <button
                                      key={mode}
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={() =>
                                        setTableInputModes(prev => ({ ...prev, [card.id]: mode }))
                                      }
                                      className={`px-3 py-1 text-xs font-medium normal-case tracking-normal transition-colors ${
                                        (tableInputModes[card.id] ?? 'raw') === mode
                                          ? 'bg-[var(--color-accent)] text-white'
                                          : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                                      }`}
                                    >
                                      {mode === 'raw' ? 'Raw Data' : 'Enter Table'}
                                    </button>
                                  ))}
                                </div>
                                {(tableInputModes[card.id] ?? 'raw') === 'raw' &&
                                  tableConfig.rowsColId &&
                                  tableConfig.colsColId && (
                                    <button
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={() =>
                                        addLinkedGraphCard(
                                          {
                                            type: 'graph',
                                            xColId: tableConfig.colsColId,
                                            yColId: null,
                                            groupColId: tableConfig.rowsColId,
                                            chartType: 'segmented',
                                          },
                                          { x: card.x + card.width + 40, y: card.y },
                                        )
                                      }
                                      className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                                      title="Open a linked plot card for this table"
                                    >
                                      Plot Card
                                    </button>
                                  )}
                                {(tableInputModes[card.id] ?? 'raw') === 'manual' &&
                                  tableManualSnapshots[card.id] && (
                                    <>
                                      <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() =>
                                          addLinkedTableCard(
                                            {
                                              type: 'table-output',
                                              rowsColId: null,
                                              colsColId: null,
                                              manualTable: tableManualSnapshots[card.id] ?? undefined,
                                            },
                                            { x: card.x + card.width + 40, y: card.y },
                                          )
                                        }
                                        className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                                        title="Open a linked table card for this manual table"
                                      >
                                        Table Card
                                      </button>
                                      <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() =>
                                          addLinkedGraphCard(
                                            {
                                              type: 'graph',
                                              xColId: null,
                                              yColId: null,
                                              groupColId: null,
                                              chartType: 'segmented',
                                              manualTable: tableManualSnapshots[card.id] ?? undefined,
                                            },
                                            { x: card.x + card.width + 40, y: card.y },
                                          )
                                        }
                                        className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                                        title="Open a linked plot card for this manual table"
                                      >
                                        Plot Card
                                      </button>
                                    </>
                                  )}
                              </>
                              )
                            })()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 text-xs select-none opacity-0 group-hover:opacity-100 transition-opacity">⠿ drag to move</span>
                            <button
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => updateCard(card.id, { minimized: !isMinimized })}
                              className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors text-base leading-none"
                              title={isMinimized ? 'Expand card' : 'Minimize card'}
                              aria-label={isMinimized ? 'Expand card' : 'Minimize card'}
                            >
                              {isMinimized ? '▢' : '−'}
                            </button>
                            {card.config.type !== 'data-grid' && (
                              <button
                                onPointerDown={e => e.stopPropagation()}
                                onClick={() => removeCard(card.id)}
                                className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card content */}
                        {!isMinimized && (
                        <div className={`flex-1 min-h-0 overflow-hidden ${card.config.type === 'data-grid' ? '' : 'p-4'}`}>
                          {card.config.type === 'data-grid' && (
                            <div className="h-full flex flex-col">
                              <GridToolbar onShare={onShareDataset} />
                              <div className="flex-1 min-h-0 overflow-hidden p-2">
                                <DataGrid fillHeight />
                              </div>
                            </div>
                          )}
                          {card.config.type === 'graph' && (
                            <GraphCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onSetChartType={(ct: ChartType) => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), chartType: ct } })}
                              onAssignZone={(zone, colId) => assignGraphZone(card.id, zone, colId)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'summary' && (
                            <SummaryCard cardId={card.id} config={card.config} onClearZone={z => clearZone(card.id, z)} onRemove={() => removeCard(card.id)} hideHeader />
                          )}
                          {card.config.type === 'table' && (
                            <div className="h-full overflow-auto">
                              <TwoWayTable
                                cardId={card.id}
                                rowsColId={card.config.rowsColId}
                                colsColId={card.config.colsColId}
                                onClearZone={z => clearZone(card.id, z)}
                                inputMode={tableInputModes[card.id] ?? 'raw'}
                                onInputModeChange={mode =>
                                  setTableInputModes(prev => ({ ...prev, [card.id]: mode }))
                                }
                                onManualTableDataChange={snapshot =>
                                  setTableManualSnapshots(prev => ({ ...prev, [card.id]: snapshot }))
                                }
                              />
                            </div>
                          )}
                          {card.config.type === 'table-output' && (
                            <TableCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
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
                          {card.config.type === 'generator' && (
                            <RandomGeneratorCard />
                          )}
                          {card.config.type === 'dice-roller' && (
                            <DiceRollerCard cardId={card.id} onRemove={() => removeCard(card.id)} hideHeader />
                          )}
                          {card.config.type === 'sim-results' && (
                            <SimResultsCard cardId={card.id} config={card.config} />
                          )}
                          {card.config.type === 'means' && (
                            <MeansCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                            />
                          )}
                          {card.config.type === 'testinterval' && (
                            <PlaceholderCard label="Test / Interval" />
                          )}
                          {card.config.type === 'simulation' && (
                            <PlaceholderCard label="Simulation" />
                          )}
                        </div>
                        )}
                      </div>

                      {/* Right-edge resize handle */}
                      {!isMinimized && (
                      <div
                        onPointerDown={e => startResize(e, card.id, 'e')}
                        className="absolute top-0 w-3 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ right: -5 }}
                      >
                        <div className="absolute top-1/2 -translate-y-1/2 left-0.5 w-1.5 h-8 bg-slate-300 rounded-full" />
                      </div>
                      )}

                      {/* Bottom-edge resize handle */}
                      {!isMinimized && (
                      <div
                        onPointerDown={e => startResize(e, card.id, 's')}
                        className="absolute left-0 h-3 w-full cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ bottom: -5 }}
                      >
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 h-1.5 w-8 bg-slate-300 rounded-full" />
                      </div>
                      )}

                      {/* SE corner resize handle */}
                      {!isMinimized && (
                      <div
                        onPointerDown={e => startResize(e, card.id, 'se')}
                        className="absolute w-5 h-5 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end"
                        style={{ right: -5, bottom: -5 }}
                      >
                        <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                      </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

        </div>
      </div>

      {contextMenu && (
        <WorkspaceContextMenu
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          onAdd={handleContextAdd}
          onClose={() => setContextMenu(null)}
        />
      )}

      </SwapAnimContext.Provider>
      <DragOverlay dropAnimation={null}>
        {activeCol && <GhostChip col={activeCol} />}
      </DragOverlay>
    </DndContext>
  )
}
