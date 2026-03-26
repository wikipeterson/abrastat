'use client'

import { useState, useCallback, useEffect } from 'react'
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
import { CardConfig, GraphCardConfig } from '@/lib/exploreTypes'
import { ChartType } from '@/lib/chartHelpers'
import { GraphCard } from './cards/GraphCard'
import { SummaryCard } from './cards/SummaryCard'
import { TableCard } from './cards/TableCard'
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

// ─── Add Card menu ─────────────────────────────────────────────────────────────

const CARD_OPTIONS: { type: CardConfig['type']; icon: string; label: string; description: string }[] = [
  { type: 'graph',   icon: '📈', label: 'Graph',         description: 'Auto-selects chart from variables' },
  { type: 'summary', icon: '📊', label: 'Summary Stats', description: 'Stats table for one variable' },
  { type: 'table',   icon: '🔢', label: 'Two-Way Table', description: 'Cross-tabulation of two categorical variables' },
]

function AddCardMenu({ onAdd }: { onAdd: (type: CardConfig['type']) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[var(--color-border)]
          text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)]
          hover:text-[var(--color-accent)] shadow-sm transition-colors"
      >
        <span className="text-lg leading-none text-[var(--color-accent)]">+</span>
        Add Card
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden min-w-[220px]">
            {CARD_OPTIONS.map(o => (
              <button
                key={o.type}
                onClick={() => { onAdd(o.type); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-[var(--color-border)] last:border-0"
              >
                <span className="text-xl">{o.icon}</span>
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">{o.label}</div>
                  <div className="text-xs text-[var(--color-muted)]">{o.description}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export function ExploreCanvas() {
  const { grid, exploreCards, addExploreCard, removeExploreCard, updateExploreCard, purgeExploreStaleIds } = useStore()
  const [activeColId, setActiveColId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const hasData = grid.rows.some(r => Object.values(r).some(v => String(v).trim()))

  // Clear stale column IDs when columns change
  useEffect(() => {
    purgeExploreStaleIds(new Set(grid.columns.map(c => c.id)))
  }, [grid.columns, purgeExploreStaleIds])

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

    const card = exploreCards.find(c => c.id === cardId)
    if (!card) return
    const cfg = card.config

    // Determine source zone name (only for same-card zone-to-zone drags)
    const sourceZone = (sourceZoneId && sourceZoneId.startsWith(cardId + ':'))
      ? sourceZoneId.slice(cardId.length + 1)
      : null

    let newConfig: CardConfig | null = null
    if (cfg.type === 'graph') {
      let c = { ...cfg }
      if (zone === 'x')     c = { ...c, xColId: colId }
      if (zone === 'y')     c = { ...c, yColId: colId }
      if (zone === 'group') c = { ...c, groupColId: colId }
      // Clear source zone atomically so it looks like a move
      if (sourceZone && sourceZone !== zone) {
        if (sourceZone === 'x')     c = { ...c, xColId: null }
        if (sourceZone === 'y')     c = { ...c, yColId: null }
        if (sourceZone === 'group') c = { ...c, groupColId: null }
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
    if (cfg.type === 'table') {
      let c = { ...cfg }
      if (zone === 'rows') c = { ...c, rowsColId: colId }
      if (zone === 'cols') c = { ...c, colsColId: colId }
      if (sourceZone && sourceZone !== zone) {
        if (sourceZone === 'rows') c = { ...c, rowsColId: null }
        if (sourceZone === 'cols') c = { ...c, colsColId: null }
      }
      newConfig = c
    }
    if (newConfig) updateExploreCard(cardId, { config: newConfig })
  }, [exploreCards, updateExploreCard])

  function clearZone(cardId: string, zone: string) {
    const card = exploreCards.find(c => c.id === cardId)
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
    if (cfg.type === 'table') {
      if (zone === 'rows') newConfig = { ...cfg, rowsColId: null }
      if (zone === 'cols') newConfig = { ...cfg, colsColId: null }
    }
    if (newConfig) updateExploreCard(cardId, { config: newConfig })
  }

  // ─── Card movement ─────────────────────────────────────────────────────────
  function startMove(e: React.PointerEvent, cardId: string) {
    if (e.button !== 0) return
    e.stopPropagation()
    const card = exploreCards.find(c => c.id === cardId)
    if (!card) return
    const startX = e.clientX, startY = e.clientY
    const startCardX = card.x, startCardY = card.y

    function onMove(ev: PointerEvent) {
      updateExploreCard(cardId, {
        x: Math.max(0, startCardX + ev.clientX - startX),
        y: Math.max(0, startCardY + ev.clientY - startY),
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ─── Card resize ──────────────────────────────────────────────────────────
  function startResize(e: React.PointerEvent, cardId: string) {
    e.stopPropagation()
    const card = exploreCards.find(c => c.id === cardId)
    if (!card) return
    const startX = e.clientX
    const startWidth = card.width

    function onMove(ev: PointerEvent) {
      updateExploreCard(cardId, { width: Math.max(340, startWidth + ev.clientX - startX) })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const activeCol = activeColId ? (grid.columns.find(c => c.id === activeColId) ?? null) : null

  if (!hasData) {
    return <EmptyState icon="📈" title="No data loaded" description="Add data in the Data tab to start exploring." />
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0">

        {/* Variable sidebar */}
        <aside className="w-44 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Variables</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
            {grid.columns.map(col => (
              <DraggableChip key={col.id} col={col} />
            ))}
          </div>
        </aside>

        {/* Canvas column */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--color-border)] bg-white flex items-center gap-3">
            <AddCardMenu onAdd={addExploreCard} />
            {exploreCards.length > 0 && (
              <span className="text-xs text-[var(--color-muted)]">
                Drag card headers to move · drag right edge to resize
              </span>
            )}
          </div>

          {/* Scrollable free-form canvas */}
          <div className="flex-1 overflow-auto bg-slate-50/60">
            <div className="relative" style={{ minWidth: 1400, minHeight: 1800 }}>
              {exploreCards.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-3 opacity-30">✦</div>
                    <p className="text-[var(--color-muted)] text-sm">Click <strong>+ Add Card</strong> in the toolbar to get started</p>
                  </div>
                </div>
              )}

              {exploreCards.map(card => (
                <div
                  key={card.id}
                  style={{
                    position: 'absolute',
                    left: card.x,
                    top: card.y,
                    width: card.width,
                  }}
                  className="group"
                >
                  {/* Card shell with resize handle */}
                  <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">

                    {/* Move handle — drag this to reposition the card */}
                    <div
                      onPointerDown={e => startMove(e, card.id)}
                      className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] cursor-grab active:cursor-grabbing select-none"
                    >
                      <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                        {card.config.type === 'graph' ? 'Graph' : card.config.type === 'summary' ? 'Summary Stats' : 'Two-Way Table'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 text-xs select-none opacity-0 group-hover:opacity-100 transition-opacity">⠿ drag to move</span>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => removeExploreCard(card.id)}
                          className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Card content — no header since we have one above */}
                    <div className="p-4 space-y-3">
                      {card.config.type === 'graph' && (
                        <GraphCard
                          cardId={card.id}
                          config={card.config}
                          onClearZone={z => clearZone(card.id, z)}
                          onSetChartType={(ct: ChartType) => updateExploreCard(card.id, { config: { ...(card.config as GraphCardConfig), chartType: ct } })}
                          onRemove={() => removeExploreCard(card.id)}
                          hideHeader
                        />
                      )}
                      {card.config.type === 'summary' && (
                        <SummaryCard cardId={card.id} config={card.config} onClearZone={z => clearZone(card.id, z)} onRemove={() => removeExploreCard(card.id)} hideHeader />
                      )}
                      {card.config.type === 'table' && (
                        <TableCard cardId={card.id} config={card.config} onClearZone={z => clearZone(card.id, z)} onRemove={() => removeExploreCard(card.id)} hideHeader />
                      )}
                    </div>

                    {/* Right-edge resize handle */}
                    <div
                      onPointerDown={e => startResize(e, card.id)}
                      className="absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ right: -4 }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1.5 h-8 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
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
