'use client'

import { useRef, useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { D6Canvas, D6CanvasHandle } from './D6Canvas'
import { useStore } from '@/lib/store'
import { DiceRollerCardConfig } from '@/lib/exploreTypes'

// ── Dice configuration ────────────────────────────────────────────────────────

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const
type DiceSides = typeof DICE_TYPES[number]

const DIE_BG: Record<DiceSides, string> = {
  4:   '#F59E0B',
  6:   '#0EA5A0',
  8:   '#6366F1',
  10:  '#10B981',
  12:  '#EC4899',
  20:  '#EF4444',
  100: '#8B5CF6',
}

const DIE_SHAPE: Record<DiceSides, string | null> = {
  4:   'polygon(50% 3%, 97% 95%, 3% 95%)',
  6:   null,
  8:   'polygon(50% 3%, 97% 50%, 50% 97%, 3% 50%)',
  10:  'polygon(50% 0%, 80% 18%, 95% 55%, 75% 95%, 25% 95%, 5% 55%, 20% 18%)',
  12:  'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
  20:  'polygon(50% 5%, 95% 92%, 5% 92%)',
  100: 'circle(47%)',
}

interface DieInTray {
  id: string
  sides: DiceSides
}

// ── Palette die ───────────────────────────────────────────────────────────────

function PaletteDie({ sides, count, onClick }: { sides: DiceSides; count: number; onClick: () => void }) {
  const bg   = DIE_BG[sides]
  const clip = DIE_SHAPE[sides]
  return (
    <button
      onClick={onClick}
      title={`Add d${sides}`}
      className="relative flex flex-col items-center group"
    >
      {/* Count badge — top-left of the die shape */}
      {count > 0 && (
        <span
          className="absolute -top-1.5 -left-1.5 z-10 min-w-[18px] h-[18px] px-0.5
                     rounded-full bg-[var(--color-text)] text-white
                     text-[9px] font-bold flex items-center justify-center leading-none"
        >
          {count}
        </span>
      )}
      <div
        className="w-11 h-11 flex items-center justify-center font-bold text-white
                   transition-transform duration-100 group-hover:scale-110 group-active:scale-95
                   cursor-pointer select-none shadow"
        style={{
          backgroundColor: bg,
          clipPath: clip ?? undefined,
          borderRadius: clip ? undefined : '9px',
          fontSize: sides === 100 ? '9px' : '11px',
        }}
      >
        d{sides}
      </div>
    </button>
  )
}

// ── Results strip ─────────────────────────────────────────────────────────────

function ResultsStrip({
  tray,
  finalResults,
}: {
  tray: DieInTray[]
  finalResults: Record<string, number>
}) {
  const settled = tray.filter(d => finalResults[d.id] != null)
  const allDone = settled.length === tray.length
  const total = allDone ? tray.reduce((s, d) => s + (finalResults[d.id] ?? 0), 0) : null

  return (
    <div className="min-h-[44px] px-1 py-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {tray.length > 0 ? tray.map(die => {
          const val = finalResults[die.id]
          return (
            <span key={die.id} className="font-mono text-xs">
              <span className="text-[var(--color-muted)]">d{die.sides}:</span>{' '}
              {val != null
                ? <span className="font-bold" style={{ color: DIE_BG[die.sides] }}>{val}</span>
                : <span className="text-[var(--color-muted)]">…</span>}
            </span>
          )
        }) : (
          <span className="text-xs text-[var(--color-muted)] italic">Add dice, then roll.</span>
        )}
        {total != null && tray.length > 1 && (
          <span className="ml-1 font-bold text-sm text-[var(--color-text)]">= {total}</span>
        )}
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface DiceRollerCardProps {
  cardId?: string
  onRemove: () => void
  hideHeader?: boolean
}

export function DiceRollerCard({ cardId, onRemove, hideHeader }: DiceRollerCardProps) {
  const [tray, setTray]               = useState<DieInTray[]>([])
  const [finalResults, setFinalResults] = useState<Record<string, number>>({})
  const canvasRef = useRef<D6CanvasHandle>(null)

  // ── Store connections for linked results ──────────────────────────────────
  const exploreCards      = useStore(s => s.exploreCards)
  const updateExploreCard = useStore(s => s.updateExploreCard)
  const addSimResultsCard = useStore(s => s.addSimResultsCard)
  const pushSimResult     = useStore(s => s.pushSimResult)

  const diceConfig = cardId
    ? (exploreCards.find(c => c.id === cardId)?.config as DiceRollerCardConfig | undefined)
    : undefined
  const trackedMode       = diceConfig?.trackedMode       ?? 'sum'
  const linkedResultsCardId = diceConfig?.linkedResultsCardId ?? null

  const rollInProgressRef = useRef(false)

  // Count of each die type currently in tray
  const dieCounts = DICE_TYPES.reduce((acc, s) => {
    acc[s] = tray.filter(d => d.sides === s).length
    return acc
  }, {} as Record<DiceSides, number>)

  function addDie(sides: DiceSides) {
    const id = uuid()
    setTray(prev => [...prev, { id, sides }])
    canvasRef.current?.addDie(id, sides)
  }

  function rollAll() {
    setFinalResults({})
    rollInProgressRef.current = true
    canvasRef.current?.rollAll()
  }

  // ── Roll-complete detection → push tracked value to linked results ──────────
  useEffect(() => {
    if (!rollInProgressRef.current) return
    if (tray.length === 0) return
    if (!tray.every(d => finalResults[d.id] != null)) return

    rollInProgressRef.current = false

    if (!linkedResultsCardId) return

    const settled = tray.map(d => finalResults[d.id]).filter((v): v is number => v != null)
    let trackedValue: number | null = null

    if (trackedMode === 'sum') {
      trackedValue = settled.reduce((s, v) => s + v, 0)
    } else if (trackedMode === 'difference' && settled.length === 2) {
      trackedValue = Math.abs(settled[0] - settled[1])
    }

    if (trackedValue != null) pushSimResult(linkedResultsCardId, trackedValue)
  }, [finalResults, tray, trackedMode, linkedResultsCardId, pushSimResult])

  // ── Track Results: create or focus the linked results card ───────────────────
  function handleTrackResults() {
    if (!cardId) return
    const existing = exploreCards.find(
      c => c.config.type === 'sim-results' && c.config.sourceCardId === cardId,
    )
    if (existing) return   // already exists — don't duplicate

    const myCard = exploreCards.find(c => c.id === cardId)
    const pos = myCard
      ? { x: myCard.x + myCard.width + 40, y: myCard.y }
      : { x: 700, y: 20 }

    const newId = addSimResultsCard(cardId, trackedMode, pos, 'Dice Roller')
    updateExploreCard(cardId, {
      config: { type: 'dice-roller', linkedResultsCardId: newId, trackedMode },
    })
  }

  function setTrackedMode(mode: 'sum' | 'difference') {
    if (!cardId) return
    updateExploreCard(cardId, {
      config: { type: 'dice-roller', linkedResultsCardId, trackedMode: mode },
    })
  }

  const hasLinkedCard = linkedResultsCardId != null &&
    exploreCards.some(c => c.id === linkedResultsCardId)
  const canDiff = tray.length === 2

  function clearAll() {
    canvasRef.current?.clearAll()
    setTray([])
    setFinalResults({})
  }

  function handleDieSettled(id: string, value: number) {
    setFinalResults(prev => ({ ...prev, [id]: value }))
  }

  const inner = (
    <div className="flex flex-col h-full">

      {/* ── Physics tray — fills available space ── */}
      <div className="flex-1 min-h-[260px]">
        <D6Canvas ref={canvasRef} onDieSettled={handleDieSettled} />
      </div>

      {/* ── Palette ── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-3 border-t border-[var(--color-border)]">
        <div className="flex flex-wrap gap-3 justify-center">
          {DICE_TYPES.map(sides => (
            <PaletteDie
              key={sides}
              sides={sides}
              count={dieCounts[sides]}
              onClick={() => addDie(sides)}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={rollAll}
            disabled={tray.length === 0}
            className="flex-1 rounded-xl bg-[var(--color-accent)] text-white font-semibold py-2.5
                       disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 transition"
          >
            Roll
          </button>
          <button
            onClick={clearAll}
            disabled={tray.length === 0}
            className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm
                       text-[var(--color-muted)] hover:text-red-500 hover:border-red-200 transition
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
        <div className="mt-2 border-t border-[var(--color-border)]/80 pt-2">
          <ResultsStrip tray={tray} finalResults={finalResults} />
        </div>

        {/* ── Tracking controls ── */}
        {cardId && (
          <div className="mt-2 pt-2 border-t border-[var(--color-border)]/60 flex items-center gap-2">
            {/* Mode selector */}
            <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-[10px] flex-shrink-0">
              <button
                onClick={() => setTrackedMode('sum')}
                className={`px-2 py-1 transition-colors ${
                  trackedMode === 'sum'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                Sum
              </button>
              <button
                onClick={() => setTrackedMode('difference')}
                disabled={!canDiff}
                className={`px-2 py-1 border-l border-[var(--color-border)] transition-colors
                            disabled:opacity-30 disabled:cursor-not-allowed ${
                  trackedMode === 'difference'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                |Δ|
              </button>
            </div>
            {/* Track / linked indicator */}
            <button
              onClick={handleTrackResults}
              className={`flex-1 text-[10px] rounded-lg py-1 px-2 transition-colors
                          border ${
                hasLinkedCard
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
              }`}
            >
              {hasLinkedCard ? '📊 Results linked' : '📊 Track results'}
            </button>
          </div>
        )}
      </div>

    </div>
  )

  if (hideHeader) return inner

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
          Dice Roller
        </span>
        <button
          onClick={onRemove}
          className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {inner}
      </div>
    </div>
  )
}
