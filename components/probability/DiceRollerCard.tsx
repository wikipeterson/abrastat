'use client'

import { useRef, useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { D6Canvas, D6CanvasHandle, DEFAULT_DICE_TUNING, DiceTuning } from './D6Canvas'
import { useStore } from '@/lib/store'
import { DiceRollerCardConfig } from '@/lib/exploreTypes'

// ── Dice configuration ────────────────────────────────────────────────────────

const DICE_TYPES = [6, 10, 100] as const
type DiceSides = typeof DICE_TYPES[number]

const DIE_BG: Record<DiceSides, string> = {
  6:   '#0EA5A0',
  10:  '#10B981',
  100: '#8B5CF6',
}

const DIE_SHAPE: Record<DiceSides, string | null> = {
  6:   null,
  10:  'polygon(50% 0%, 80% 18%, 95% 55%, 75% 95%, 25% 95%, 5% 55%, 20% 18%)',
  100: 'circle(47%)',
}

interface DieInTray {
  id: string
  sides: DiceSides
}

function getTrackedRange(
  tray: DieInTray[],
  trackedMode: 'sum' | 'difference',
): { minValue: number; maxValue: number } {
  if (trackedMode === 'difference' && tray.length === 2) {
    return {
      minValue: 0,
      maxValue: Math.max(tray[0].sides, tray[1].sides) - 1,
    }
  }

  return {
    minValue: tray.length === 0 ? 1 : tray.length,
    maxValue: tray.length === 0 ? 6 : tray.reduce((sum, die) => sum + die.sides, 0),
  }
}

function deriveTrackedValues(
  rolls: number[][],
  trackedMode: 'sum' | 'difference',
): number[] {
  if (trackedMode === 'sum') {
    return rolls.map(roll => roll.reduce((sum, value) => sum + value, 0))
  }
  return rolls
    .filter(roll => roll.length === 2)
    .map(roll => Math.abs(roll[0] - roll[1]))
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

// ── Main card ─────────────────────────────────────────────────────────────────

interface DiceRollerCardProps {
  cardId?: string
  onRemove: () => void
  hideHeader?: boolean
}

export function DiceRollerCard({ cardId, onRemove, hideHeader }: DiceRollerCardProps) {
  const [tray, setTray]               = useState<DieInTray[]>([])
  const [finalResults, setFinalResults] = useState<Record<string, number>>({})
  const [tuning] = useState<DiceTuning>(DEFAULT_DICE_TUNING)
  const [fastRollCount, setFastRollCount] = useState('100')
  const canvasRef = useRef<D6CanvasHandle>(null)

  // ── Store connections for linked results ──────────────────────────────────
  const exploreCards      = useStore(s => s.exploreCards)
  const updateExploreCard = useStore(s => s.updateExploreCard)
  const addSimResultsCard = useStore(s => s.addSimResultsCard)
  const pushSimResult     = useStore(s => s.pushSimResult)
  const pushSimResultsBatch = useStore(s => s.pushSimResultsBatch)

  const diceConfig = cardId
    ? (exploreCards.find(c => c.id === cardId)?.config as DiceRollerCardConfig | undefined)
    : undefined
  const linkedResultsCardId = diceConfig?.linkedResultsCardId ?? null

  // Read trackedMode from the linked results card (source of truth)
  const linkedCard = exploreCards.find(c => c.id === linkedResultsCardId)
  const trackedMode = (linkedCard?.config.type === 'sim-results' ? linkedCard.config.trackedMode : null) ?? 'sum'

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

  function fastRollMany() {
    const count = Math.max(1, Math.min(10000, Math.floor(Number(fastRollCount) || 0)))
    if (tray.length === 0 || count < 1) return

    const rolls = Array.from({ length: count }, () =>
      tray.map(die => Math.floor(Math.random() * die.sides) + 1),
    )

    if (linkedResultsCardId) {
      pushSimResultsBatch(linkedResultsCardId, rolls)
    }

    const lastRoll = rolls[rolls.length - 1]
    setFinalResults(Object.fromEntries(tray.map((die, index) => [die.id, lastRoll[index]])))
  }

  // ── Roll-complete detection → push tracked value to linked results ──────────
  useEffect(() => {
    if (!rollInProgressRef.current) return
    if (tray.length === 0) return
    if (!tray.every(d => finalResults[d.id] != null)) return

    rollInProgressRef.current = false

    if (!linkedResultsCardId) return

    const settled = tray.map(d => finalResults[d.id]).filter((v): v is number => v != null)
    pushSimResult(linkedResultsCardId, settled)
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

    const newId = addSimResultsCard(cardId, trackedMode, pos, 'Dice Roller', trackedRange)
    updateExploreCard(cardId, {
      config: { type: 'dice-roller', linkedResultsCardId: newId, trackedMode: 'sum' },
    })
  }

  const hasLinkedCard = linkedResultsCardId != null &&
    exploreCards.some(c => c.id === linkedResultsCardId)
  const trackedRange = getTrackedRange(tray, trackedMode)
  const supportsDifference = tray.length === 2

  // Keep linked results card's minValue/maxValue in sync with current tray
  useEffect(() => {
    if (!linkedResultsCardId) return

    const lc = exploreCards.find(c => c.id === linkedResultsCardId)
    if (!lc || lc.config.type !== 'sim-results') return

    const cfg = lc.config
    const nextTrackedMode =
      cfg.trackedMode === 'difference' && !supportsDifference ? 'sum' : cfg.trackedMode
    const nextValues =
      nextTrackedMode !== cfg.trackedMode
        ? deriveTrackedValues(cfg.rolls, nextTrackedMode)
        : cfg.values

    if (
      cfg.minValue === trackedRange.minValue &&
      cfg.maxValue === trackedRange.maxValue &&
      cfg.supportsDifference === supportsDifference &&
      nextTrackedMode === cfg.trackedMode
    ) return

    updateExploreCard(linkedResultsCardId, {
      config: {
        ...cfg,
        trackedMode: nextTrackedMode,
        supportsDifference,
        minValue: trackedRange.minValue,
        maxValue: trackedRange.maxValue,
        values: nextValues,
      },
    })
  }, [
    exploreCards,
    linkedResultsCardId,
    trackedRange.minValue,
    trackedRange.maxValue,
    supportsDifference,
    updateExploreCard,
  ])

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

      {/* ── Palette ── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-3 border-b border-[var(--color-border)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {DICE_TYPES.map(sides => (
              <PaletteDie
                key={sides}
                sides={sides}
                count={dieCounts[sides]}
                onClick={() => addDie(sides)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={rollAll}
              disabled={tray.length === 0}
              className="rounded-xl bg-[var(--color-accent)] text-white font-semibold px-5 py-2.5
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)]/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--color-muted)] whitespace-nowrap">
              Fast roll
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={fastRollCount}
              onChange={e => setFastRollCount(e.target.value)}
              className="w-24 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={fastRollMany}
              disabled={tray.length === 0}
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Roll X Times
            </button>
          </div>

          {cardId && (
            <button
              onClick={handleTrackResults}
              className={`rounded-lg py-2 px-3 text-sm transition-colors border ${
                hasLinkedCard
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
              }`}
            >
              {hasLinkedCard ? '📊 Results linked' : '📊 Link results'}
            </button>
          )}
        </div>
      </div>

      {/* ── Physics tray — fills remaining space ── */}
      <div className="flex-1 min-h-[200px]">
        <D6Canvas ref={canvasRef} onDieSettled={handleDieSettled} tuning={tuning} />
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
