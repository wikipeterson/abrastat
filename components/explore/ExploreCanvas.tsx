'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { Plus, Sparkles } from 'lucide-react'
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
import { CardConfig, GraphCardConfig, MeansCardConfig, ExploreCard, ManualTwoWayTableSnapshot, TwoPropRandomizationCardConfig, TwoMeanRandomizationCardConfig, OnePropRandomizationCardConfig } from '@/lib/exploreTypes'
import { ChartType } from '@/lib/chartHelpers'
import { SwapAnimContext, SwapAnimState } from '@/lib/swapAnimContext'
import { buildInitialConfig, getSuggestionReadingLine, normalizeGraphConfigForColumns, suggestAnalyses } from '@/lib/suggest'
import { GraphCard } from './cards/GraphCard'
import { SummaryCard } from './cards/SummaryCard'
import { RegressionCard } from './cards/RegressionCard'
import { RegressionByEyeCard } from './cards/RegressionByEyeCard'
import { TableCard } from './cards/TableCard'
import { TwoWayTable } from '@/components/applets/TwoWayTable'
import { DistributionCard } from '@/components/inference/DistributionCard'
import { MeansCard } from '@/components/inference/MeansCard'
import { ProportionsCard } from '@/components/inference/ProportionsCard'
import { TwoPropRandomizationTest, TwoPropSimCard } from '@/components/inference/TwoPropRandomizationTest'
import { TwoMeanRandomizationTest, TwoMeanSimCard } from '@/components/inference/TwoMeanRandomizationTest'
import { OnePropRandomizationTest, OnePropSimCard } from '@/components/inference/OnePropRandomizationTest'
import { RandomGeneratorCard } from '@/components/probability/RandomGeneratorCard'
import { CompareNormalsCard } from '@/components/probability/CompareNormalsCard'
import { DiceRollerCard } from '@/components/probability/DiceRollerCard'
import { SimResultsCard } from '@/components/probability/SimResultsCard'
import { SimulationCard } from '@/components/probability/SimulationCard'

type ZoneAssignableCardConfig =
  | GraphCardConfig
  | MeansCardConfig
  | OnePropRandomizationCardConfig
  | TwoPropRandomizationCardConfig
  | TwoMeanRandomizationCardConfig
  | Extract<CardConfig, { type: 'summary' | 'regression' | 'regression-by-eye' | 'proportions' | 'table' }>

const ZONE_ASSIGNABLE_TYPES = new Set<CardConfig['type']>([
  'graph',
  'summary',
  'regression',
  'regression-by-eye',
  'means',
  'proportions',
  'table',
  'one-prop-randomization',
  'two-prop-randomization',
  'two-mean-randomization',
])

function isZoneAssignableConfig(config: CardConfig): config is ZoneAssignableCardConfig {
  return ZONE_ASSIGNABLE_TYPES.has(config.type)
}

interface CardOption {
  type: CardConfig['type']
  icon: string
  label: string
}

interface ExploreCanvasProps {
  addCardCatalogOpen?: boolean
  onCloseAddCardCatalog?: () => void
}

const EXPLORE_CARD_OPTIONS: CardOption[] = [
  { type: 'graph', icon: '📈', label: 'Graph' },
  { type: 'summary', icon: '📊', label: 'Summary Statistics' },
  { type: 'table', icon: '⊞', label: 'Two-Way Table' },
  { type: 'regression', icon: '📉', label: 'Regression' },
  { type: 'regression-by-eye', icon: '✏️', label: 'Regression by Eye' },
]

const PROBABILITY_CARD_OPTIONS: CardOption[] = [
  { type: 'distribution',    icon: '🔔', label: 'Distribution Calculators' },
  { type: 'compare-normals', icon: '⚖️', label: 'Compare Normals' },
  { type: 'generator',       icon: '🎛️', label: 'Random Number Generator' },
  { type: 'dice-roller',     icon: '🎲', label: 'Dice Roller' },
  { type: 'simulation', icon: '🔀', label: 'Coin Flipper' },
]

const INFERENCE_CARD_OPTIONS: CardOption[] = [
  { type: 'means', icon: '📐', label: 'Means' },
  { type: 'proportions', icon: '⚖️', label: 'Proportions' },
  { type: 'one-prop-randomization', icon: '🎯', label: 'One-Proportion Randomization Test' },
  { type: 'two-prop-randomization', icon: '🎲', label: 'Two-Prop Randomization Test' },
  { type: 'two-mean-randomization', icon: '📏', label: 'Two-Mean Randomization Test' },
]

const CARD_OPTION_GROUPS = [
  { id: 'explore', label: 'Explore', options: EXPLORE_CARD_OPTIONS },
  { id: 'probability', label: 'Probability', options: PROBABILITY_CARD_OPTIONS },
  { id: 'inference', label: 'Inference', options: INFERENCE_CARD_OPTIONS },
] as const

function StripOptionCard({
  icon,
  label,
  reason,
  recommended = false,
  onClick,
}: {
  icon: string
  label: string
  reason: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[220px] max-w-[280px] rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        recommended
          ? 'border-[var(--color-gold)] bg-[var(--color-gold-light)]'
          : 'border-[var(--color-border)] bg-[var(--color-bg)]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{icon}</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        </div>
        {recommended && (
          <span className="rounded-full border border-[var(--color-gold)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5A3A00]">
            Recommended
          </span>
        )}
      </div>
      <p className="text-sm leading-5 text-[var(--color-muted)]">{reason}</p>
    </button>
  )
}

function CompactCatalogRow({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-light)]"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg)] text-base leading-none">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function GhostChip({ col }: { col: GridColumn }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)] text-sm font-medium shadow-lg rotate-1 cursor-grabbing">
      <span className="opacity-70 text-xs font-mono">{col.type === 'numeric' ? '#' : 'C'}</span>
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
    case 'table-output': return 'Two-Way Table'
    case 'regression':   return 'Regression'
    case 'regression-by-eye': return 'Regression by Eye'
    case 'distribution':    return 'Distribution Calculators'
    case 'compare-normals': return 'Compare Normals'
    case 'generator':       return 'Random Number Generator'
    case 'dice-roller':  return 'Dice Roller'
    case 'sim-results':   return 'Roll Results'
    case 'proportions': return 'Proportions'
    case 'one-prop-randomization': return 'One-Proportion Randomization Test'
    case 'one-prop-sim':           return 'One-Prop Simulation'
    case 'two-prop-randomization': return 'Two-Prop Randomization Test'
    case 'two-prop-sim':           return 'Randomization Simulation'
    case 'two-mean-randomization': return 'Two-Mean Randomization Test'
    case 'two-mean-sim':           return 'Randomization Simulation'
    case 'simulation':   return 'Coin Flipper'
    case 'means':        return 'Means'
    default:             return 'Card'
  }
}

function getVisibleCardLabel(card: ExploreCard): string {
  if (card.config.type === 'sim-results') {
    const sourceLabel = card.config.sourceLabel === 'Coin Flip Simulator'
      ? 'Coin Flipper'
      : card.config.sourceLabel
    if (sourceLabel === 'Coin Flipper') return 'Coin Flipper Results'
  }
  return cardLabel(card.config.type)
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
        className="fixed z-[100] w-[280px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden"
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
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-accent-light)] transition-colors"
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

export function ExploreCanvas({
  addCardCatalogOpen = false,
  onCloseAddCardCatalog,
}: ExploreCanvasProps) {
  const {
    grid, addExploreCard,
    selectedColumnIds, setSelectedColumnIds,
    exploreCards, removeExploreCard, updateExploreCard, purgeExploreStaleIds, addLinkedGraphCard, addLinkedTableCard,
    brush, clearBrush,
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
  const topStripRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const prevCardIdsRef = useRef<string[]>([])
  const hasMountedRef = useRef(false)
  // Stable ref so the column-change effect can read latest cards without
  // cards being in its dependency array (which would cause an update loop).
  const cardsRef = useRef(cards)
  useLayoutEffect(() => { cardsRef.current = cards })

  const BASE_CANVAS_WIDTH = 2200
  const BASE_CANVAS_HEIGHT = 1800
  const CANVAS_EDGE_BUFFER = 220
  const MINIMIZED_HEIGHT = 62
  const MIN_ZOOM = 0.6
  const MAX_ZOOM = 1.8

  const canvasWidth = Math.max(
    BASE_CANVAS_WIDTH,
    ...cards.map(card => card.x + card.width + CANVAS_EDGE_BUFFER),
  )
  const canvasHeight = Math.max(
    BASE_CANVAS_HEIGHT,
    ...cards.map(card => card.y + (card.minimized ? MINIMIZED_HEIGHT : (card.height ?? 520)) + CANVAS_EDGE_BUFFER),
  )

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const centerCardInView = useCallback((card: ExploreCard, behavior: ScrollBehavior = 'smooth') => {
    const scroller = scrollRef.current
    if (!scroller) return

    const cardHeight = card.minimized ? MINIMIZED_HEIGHT : (card.height ?? 520)
    const targetLeft = Math.max(
      0,
      card.x * zoomRef.current + (card.width * zoomRef.current) / 2 - scroller.clientWidth / 2,
    )
    const targetTop = Math.max(
      0,
      card.y * zoomRef.current + (cardHeight * zoomRef.current) / 2 - scroller.clientHeight / 2,
    )

    scroller.scrollTo({
      left: targetLeft,
      top: targetTop,
      behavior,
    })
  }, [])

  useEffect(() => {
    const currentIds = cards.map(card => card.id)

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      prevCardIdsRef.current = currentIds
      return
    }

    const previousIds = new Set(prevCardIdsRef.current)
    const addedCard = cards.find(card => !previousIds.has(card.id))

    prevCardIdsRef.current = currentIds

    if (!addedCard) return

    requestAnimationFrame(() => {
      centerCardInView(addedCard)
    })
  }, [cards, centerCardInView])

  const normalizeGraphConfig = useCallback((cfg: GraphCardConfig): GraphCardConfig => {
    return normalizeGraphConfigForColumns(cfg, grid.columns)
  }, [grid.columns])

  const selectedCols = useMemo(
    () =>
      selectedColumnIds
        .map(id => grid.columns.find(col => col.id === id))
        .filter((col): col is GridColumn => !!col)
        .map(col => ({ id: col.id, name: col.name, type: col.type })),
    [grid.columns, selectedColumnIds],
  )

  const suggestionSelection = useMemo(
    () => selectedCols,
    [selectedCols],
  )

  const suggestionReadingLine = useMemo(
    () => getSuggestionReadingLine(suggestionSelection),
    [suggestionSelection],
  )

  const suggestions = useMemo(
    () => suggestAnalyses(suggestionSelection),
    [suggestionSelection],
  )

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
      if (e.key === 'Escape') {
        setContextMenu(null)
        clearBrush()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearBrush])

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

  const assignVariableToZone = useCallback((cardId: string, zone: string, colId: string, sourceZoneId?: string | null): boolean => {
    const card = cards.find(c => c.id === cardId)
    if (!card || !isZoneAssignableConfig(card.config)) return false

    const cfg = card.config
    const sourceZone = (sourceZoneId && sourceZoneId.startsWith(cardId + ':'))
      ? sourceZoneId.slice(cardId.length + 1)
      : null
    const targetZone = zone === 'canvas' ? 'x' : zone
    const droppedCol = grid.columns.find(c => c.id === colId) ?? null

    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      let c = { ...cfg }
      const prevX = c.xColId
      const prevY = c.yColId
      const prevGroup = c.groupColId
      if (targetZone === 'x') c = { ...c, xColId: colId }
      if (targetZone === 'y') c = { ...c, yColId: colId }
      if (targetZone === 'group') c = { ...c, groupColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x') c = { ...c, xColId: targetZone === 'y' ? prevY : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'y') c = { ...c, yColId: targetZone === 'x' ? prevX : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'group') c = { ...c, groupColId: targetZone === 'x' ? prevX : targetZone === 'y' ? prevY : null }
      }
      newConfig = normalizeGraphConfig(c)
    }
    if (cfg.type === 'summary') {
      if (targetZone === 'variable') {
        const ids = cfg.variableColIds.includes(colId) ? cfg.variableColIds : [...cfg.variableColIds, colId]
        newConfig = { ...cfg, variableColIds: ids }
      }
      if (targetZone === 'group' && droppedCol?.type === 'categorical') {
        newConfig = { ...cfg, groupColId: colId }
      }
    }
    if (cfg.type === 'regression') {
      if (!droppedCol) return false
      if ((targetZone === 'x' || targetZone === 'y') && droppedCol.type !== 'numeric') return false
      if (targetZone === 'group' && droppedCol.type !== 'categorical') return false
      let c = { ...cfg }
      const prevX = c.xColId
      const prevY = c.yColId
      const prevGroup = c.groupColId
      if (targetZone === 'x') c = { ...c, xColId: colId }
      if (targetZone === 'y') c = { ...c, yColId: colId }
      if (targetZone === 'group') c = { ...c, groupColId: colId }
      if (sourceZone && sourceZone !== targetZone) {
        if (sourceZone === 'x') c = { ...c, xColId: targetZone === 'y' ? prevY : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'y') c = { ...c, yColId: targetZone === 'x' ? prevX : targetZone === 'group' ? prevGroup : null }
        if (sourceZone === 'group') c = { ...c, groupColId: targetZone === 'x' ? prevX : targetZone === 'y' ? prevY : null }
      }
      newConfig = c
    }
    if (cfg.type === 'table') {
      if (!droppedCol) return false
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
      if (!droppedCol) return false
      if (targetZone === 'var1' && droppedCol.type !== 'numeric') return false
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
    if (cfg.type === 'proportions') {
      if (!droppedCol || droppedCol.type !== 'categorical') return false
      let c = { ...cfg }
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
    if (cfg.type === 'one-prop-randomization') {
      if (!droppedCol || droppedCol.type !== 'categorical') return false
      let c: OnePropRandomizationCardConfig = { ...cfg }
      if (targetZone === 'var1') c = { ...c, var1ColId: colId }
      newConfig = c
    }
    if (cfg.type === 'two-prop-randomization') {
      if (!droppedCol || droppedCol.type !== 'categorical') return false
      let c: TwoPropRandomizationCardConfig = { ...cfg }
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
    if (cfg.type === 'two-mean-randomization') {
      if (!droppedCol) return false
      let c: TwoMeanRandomizationCardConfig = { ...cfg }
      const dataShape = c.dataShape ?? 'grouping'
      if (targetZone === 'var1' && droppedCol.type !== 'numeric') return false
      if (targetZone === 'var2') {
        const requiredType = dataShape === 'two-quant' ? 'numeric' : 'categorical'
        if (droppedCol.type !== requiredType) return false
      }
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
    if (cfg.type === 'regression-by-eye') {
      if (!droppedCol || droppedCol.type !== 'numeric') return false
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

    if (!newConfig) return false

    if (sourceZone && sourceZone !== targetZone) {
      const ZONE_ORDER: Record<string, string[]> = {
        graph: ['x', 'y', 'group'],
        regression: ['x', 'y', 'group'],
        'regression-by-eye': ['x', 'y'],
        means: ['var1', 'var2'],
        proportions: ['var1', 'var2'],
        'one-prop-randomization': ['var1'],
        'two-prop-randomization': ['var1', 'var2'],
        'two-mean-randomization': ['var1', 'var2'],
        table: ['rows', 'cols'],
      }
      const order = ZONE_ORDER[cfg.type] ?? []
      const tIdx = order.indexOf(targetZone)
      const sIdx = order.indexOf(sourceZone)
      const isVertZone = cfg.type === 'graph' && sourceZone === 'y'
      const direction: SwapAnimState['direction'] =
        (!isVertZone && tIdx !== -1 && sIdx !== -1)
          ? (tIdx > sIdx ? 'from-right' : 'from-left')
          : 'pop'
      setSwapAnim({ zoneId: `${cardId}:${sourceZone}`, direction })
      setTimeout(() => setSwapAnim(null), 300)
    }

    updateCard(cardId, { config: newConfig })
    return true
  }, [cards, grid.columns, normalizeGraphConfig, updateCard])

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
    assignVariableToZone(cardId, zone, colId, sourceZoneId)
  }, [assignVariableToZone])

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
      if (zone === 'group') newConfig = { ...cfg, groupColId: null }
    }
    if (cfg.type === 'regression-by-eye') {
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
    if (cfg.type === 'proportions') {
      if (zone === 'var1') newConfig = { ...cfg, var1ColId: null }
      if (zone === 'var2') newConfig = { ...cfg, var2ColId: null }
    }
    if (cfg.type === 'one-prop-randomization') {
      if (zone === 'var1') newConfig = { ...cfg, var1ColId: null }
    }
    if ((cfg as CardConfig).type === 'two-prop-randomization') {
      const c = cfg as unknown as TwoPropRandomizationCardConfig
      if (zone === 'var1') newConfig = { ...c, var1ColId: null }
      if (zone === 'var2') newConfig = { ...c, var2ColId: null }
    }
    if ((cfg as CardConfig).type === 'two-mean-randomization') {
      const c = cfg as unknown as TwoMeanRandomizationCardConfig
      if (zone === 'var1') newConfig = { ...c, var1ColId: null }
      if (zone === 'var2') newConfig = { ...c, var2ColId: null }
    }
    if (newConfig) updateCard(cardId, { config: newConfig })
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
      case 'graph':        return { minWidth: 520, minHeight: 460 }
      case 'summary':      return { minWidth: 700, minHeight: 620 }
      case 'table':        return { minWidth: 920, minHeight: 700 }
      case 'regression':   return { minWidth: 400, minHeight: 340 }
      case 'regression-by-eye': return { minWidth: 520, minHeight: 500 }
      case 'distribution':    return { minWidth: 660, minHeight: 480 }
      case 'compare-normals': return { minWidth: 620, minHeight: 480 }
      case 'generator':       return { minWidth: 460, minHeight: 440 }
      case 'dice-roller':  return { minWidth: 760, minHeight: 700 }
      case 'sim-results':  return { minWidth: 360, minHeight: 360 }
      case 'means':        return { minWidth: 700, minHeight: 460 }
      case 'proportions':  return { minWidth: 820, minHeight: 580 }
      case 'one-prop-randomization': return { minWidth: 820, minHeight: 520 }
      case 'one-prop-sim':           return { minWidth: 1080, minHeight: 720 }
      case 'two-prop-randomization': return { minWidth: 900, minHeight: 700 }
      case 'two-prop-sim':           return { minWidth: 700, minHeight: 500 }
      case 'two-mean-randomization': return { minWidth: 900, minHeight: 700 }
      case 'two-mean-sim':           return { minWidth: 700, minHeight: 500 }
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
    onCloseAddCardCatalog?.()
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
    let adjustedStartTop = startTop

    if (selectedColumnIds.length > 0) {
      const dismissedStripHeight = topStripRef.current?.offsetHeight ?? 0
      adjustedStartTop = Math.max(0, startTop - dismissedStripHeight)
      setSelectedColumnIds([])
      requestAnimationFrame(() => {
        scrollerEl.scrollTop = adjustedStartTop
      })
    }

    setInteractionCursor('grabbing')

    function onMove(ev: PointerEvent) {
      scrollerEl.scrollLeft = startLeft - (ev.clientX - startX)
      scrollerEl.scrollTop = adjustedStartTop - (ev.clientY - startY)
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
    addExploreCard(type, { position: { x: contextMenu.worldX, y: contextMenu.worldY } })
    setContextMenu(null)
  }

  function handleSuggestionAdd(type: CardConfig['type'], chartTypeHint?: ChartType) {
    const sourceCols = type === 'summary' ? selectedCols : suggestionSelection
    const initialConfig = buildInitialConfig(type, sourceCols, { chartTypeHint })
    addExploreCard(type, { initialConfig })
    onCloseAddCardCatalog?.()
  }

  function handleCatalogAdd(option: CardOption) {
    const initialConfig = buildInitialConfig(option.type, selectedCols)
    addExploreCard(option.type, { initialConfig })
    onCloseAddCardCatalog?.()
  }

  const activeCol = activeColId ? (grid.columns.find(c => c.id === activeColId) ?? null) : null
  const visibleCards = cards.filter(c => c.config.type !== 'data-grid')
  const pinnedBrushCount = brush.pinned.length
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SwapAnimContext.Provider value={swapAnim}>
      <div className="flex h-full min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {addCardCatalogOpen ? (
            <div ref={topStripRef} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
                <Plus size={14} className="text-[var(--color-accent)]" />
                <span>Add Card</span>
              </div>
              {selectedCols.length > 0 && (
                <div className="mb-4 text-sm font-medium text-[var(--color-text)]">
                  Using: {selectedCols.map(col => col.name).join(' × ')}
                </div>
              )}
              <div className="max-h-[260px] overflow-y-auto overflow-x-hidden pr-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {CARD_OPTION_GROUPS.map(group => (
                  <div key={group.id} className="min-w-0">
                    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {group.options.map(option => (
                        <CompactCatalogRow
                          key={option.type}
                          icon={option.icon}
                          label={option.label}
                          onClick={() => handleCatalogAdd(option)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          ) : selectedCols.length > 0 && suggestionReadingLine && suggestions.length > 0 ? (
            <div ref={topStripRef} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-3 pt-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
                <Sparkles size={14} className="text-[var(--color-accent)]" />
                <span>Smart Suggest</span>
              </div>
              <div className="mb-3 text-sm font-medium text-[var(--color-text)]">
                {suggestionReadingLine}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 pt-1">
                {suggestions.map((suggestion, index) => (
                  <StripOptionCard
                    key={`${suggestion.type}-${suggestion.chartTypeHint ?? 'default'}-${index}`}
                    onClick={() => handleSuggestionAdd(suggestion.type, suggestion.chartTypeHint)}
                    icon={suggestion.icon}
                    label={suggestion.label}
                    reason={suggestion.reason}
                    recommended={suggestion.recommended}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div
            ref={scrollRef}
            onWheel={handleWheel}
            onContextMenu={handleWorkspaceContextMenu}
            className="flex-1 overflow-auto bg-[var(--color-bg)] p-2 relative cursor-grab"
          >
            {pinnedBrushCount > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-white/95 px-4 py-2 shadow-[var(--shadow-card)] backdrop-blur-sm">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {pinnedBrushCount} case{pinnedBrushCount === 1 ? '' : 's'} highlighted
                  </span>
                  <button
                    type="button"
                    onClick={clearBrush}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-text)]"
                    aria-label="Clear highlighted cases"
                    title="Clear highlighted cases"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            {visibleCards.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <p className="text-[var(--color-muted)] text-sm font-medium select-none">
                  Add a card to start analyzing
                </p>
              </div>
            )}
            <div
              ref={innerRef}
              onPointerDown={startPan}
              className="relative rounded-lg"
              style={{ width: canvasWidth * zoom, minWidth: canvasWidth * zoom, height: canvasHeight * zoom, minHeight: canvasHeight * zoom }}
            >
              {visibleCards.map(card => {
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
                    <div className="relative h-full bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)]">

                      {/* Inner clip layer */}
                      <div className="absolute inset-0 rounded-2xl overflow-hidden flex flex-col">
                        {/* Move handle */}
                        <div
                          onPointerDown={e => startMove(e, card.id)}
                          className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] cursor-grab active:cursor-grabbing select-none"
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                              {getVisibleCardLabel(card)}
                            </span>
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
                        {!isMinimized && (
                        <div className="flex-1 min-h-0 overflow-hidden p-4">
                          {card.config.type === 'graph' && (
                            <GraphCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onSetChartType={(ct: ChartType) => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), chartType: ct } })}
                              onSetTitle={title => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), title } })}
                              onSetXLabel={xLabel => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), xLabel } })}
                              onSetYLabel={yLabel => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), yLabel } })}
                              onSetXAxisMin={xAxisMin => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), xAxisMin } })}
                              onSetXAxisMax={xAxisMax => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), xAxisMax } })}
                              onSetYAxisMin={yAxisMin => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), yAxisMin } })}
                              onSetYAxisMax={yAxisMax => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), yAxisMax } })}
                              onSetColorPalette={colorPalette => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), colorPalette } })}
                              onSetDotSize={dotSize => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), dotSize } })}
                              onSetShowMeans={showMeans => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), showMeans } })}
                              onSetShowMedian={showMedian => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), showMedian } })}
                              onSetShowOutlierFences={showOutlierFences => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), showOutlierFences } })}
                              onSetBestFitMode={bestFitMode => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), bestFitMode } })}
                              onSetBarValueMode={mode => updateCard(card.id, { config: { ...(card.config as GraphCardConfig), barValueMode: mode } })}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'summary' && (
                            <SummaryCard cardId={card.id} config={card.config} onClearZone={z => clearZone(card.id, z)} onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)} onRemove={() => removeCard(card.id)} hideHeader />
                          )}
                          {card.config.type === 'table' && (
                            <div className="h-full overflow-auto">
                              <TwoWayTable
                                cardId={card.id}
                                rowsColId={card.config.rowsColId}
                                colsColId={card.config.colsColId}
                                onClearZone={z => clearZone(card.id, z)}
                                onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
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
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'regression' && (
                            <RegressionCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'regression-by-eye' && (
                            <RegressionByEyeCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                              onRemove={() => removeCard(card.id)}
                              hideHeader
                            />
                          )}
                          {card.config.type === 'distribution' && (
                            <DistributionCard preFill={card.config.preFill} />
                          )}
                          {card.config.type === 'compare-normals' && (
                            <CompareNormalsCard />
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
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                            />
                          )}
                          {card.config.type === 'proportions' && (
                            <ProportionsCard
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                            />
                          )}
                          {card.config.type === 'one-prop-randomization' && (
                            <OnePropRandomizationTest
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                            />
                          )}
                          {card.config.type === 'one-prop-sim' && (
                            <OnePropSimCard cardId={card.id} config={card.config} />
                          )}
                          {card.config.type === 'two-prop-randomization' && (
                            <TwoPropRandomizationTest
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                            />
                          )}
                          {card.config.type === 'two-prop-sim' && (
                            <TwoPropSimCard cardId={card.id} config={card.config} />
                          )}
                          {card.config.type === 'two-mean-randomization' && (
                            <TwoMeanRandomizationTest
                              cardId={card.id}
                              config={card.config}
                              onClearZone={z => clearZone(card.id, z)}
                              onAssignZone={(zone, colId) => assignVariableToZone(card.id, zone, colId)}
                            />
                          )}
                          {card.config.type === 'two-mean-sim' && (
                            <TwoMeanSimCard cardId={card.id} config={card.config} />
                          )}
                          {card.config.type === 'simulation' && (
                            <SimulationCard cardId={card.id} config={card.config} />
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
