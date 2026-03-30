'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { D6Canvas } from './D6Canvas'

// ── Dice configuration ───────────────────────────────────────────────────────

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const
type DiceSides = typeof DICE_TYPES[number]

// Each die type gets a unique color from the AbraStat palette
const DIE_BG: Record<DiceSides, string> = {
  4:   '#F59E0B',
  6:   '#0EA5A0',
  8:   '#6366F1',
  10:  '#10B981',
  12:  '#EC4899',
  20:  '#EF4444',
  100: '#8B5CF6',
}

// CSS clip-path shapes for the palette die icons
const DIE_SHAPE: Record<DiceSides, string | null> = {
  4:   'polygon(50% 3%, 97% 95%, 3% 95%)',
  6:   null, // square
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

// ── Palette die (click-to-add) ───────────────────────────────────────────────

function PaletteDie({ sides, onClick }: { sides: DiceSides; onClick: () => void }) {
  const bg = DIE_BG[sides]
  const clip = DIE_SHAPE[sides]
  const fontSize = sides === 100 ? '9px' : '11px'
  return (
    <button
      onClick={onClick}
      title={`Add d${sides}`}
      className="flex flex-col items-center gap-1 group"
    >
      <div
        className="w-10 h-10 flex items-center justify-center font-bold text-white
                   transition-transform duration-100 group-hover:scale-110 group-active:scale-95
                   cursor-pointer select-none shadow"
        style={{
          backgroundColor: bg,
          clipPath: clip ?? undefined,
          borderRadius: clip ? undefined : '8px',
          fontSize,
        }}
      >
        d{sides}
      </div>
    </button>
  )
}

// ── Tray die chip ────────────────────────────────────────────────────────────

interface TrayDieProps {
  die: DieInTray
  displayValue: number | undefined
  isRolling: boolean
  onRemove: () => void
}

function TrayDie({ die, displayValue, isRolling, onRemove }: TrayDieProps) {
  const bg = DIE_BG[die.sides]
  const chipRef = useRef<HTMLDivElement>(null)
  const prevRolling = useRef(false)

  // Play the landing animation exactly once when rolling → settled
  useEffect(() => {
    const chip = chipRef.current
    if (!chip) return
    if (prevRolling.current && !isRolling) {
      // Remove then re-add to force CSS animation restart
      chip.classList.remove('animate-dice-land')
      void chip.offsetWidth   // trigger reflow
      chip.classList.add('animate-dice-land')
    } else if (isRolling) {
      chip.classList.remove('animate-dice-land')
    }
    prevRolling.current = isRolling
  }, [isRolling])

  const valueFontSize = displayValue != null && String(displayValue).length > 2 ? 'text-lg' : 'text-2xl'

  return (
    <div className="relative">
      <div
        ref={chipRef}
        className={`w-[60px] h-[60px] rounded-xl flex items-center justify-center shadow-md
                    select-none relative overflow-hidden
                    ${isRolling ? 'animate-dice-wobble' : ''}`}
        style={{ backgroundColor: bg }}
      >
        {/* Die-type label */}
        <span className="absolute top-1.5 left-2 text-white/60 font-mono leading-none"
              style={{ fontSize: '9px' }}>
          d{die.sides}
        </span>
        {/* Result value */}
        <span className={`text-white font-bold leading-none select-none transition-none ${valueFontSize}`}>
          {displayValue != null ? displayValue : '·'}
        </span>
      </div>
      {/* Remove button — always visible, turns red on hover */}
      <button
        onClick={onRemove}
        aria-label={`Remove d${die.sides}`}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                   bg-slate-400 hover:bg-red-500 text-white text-xs
                   flex items-center justify-center shadow transition-colors
                   leading-none font-bold"
      >
        ×
      </button>
    </div>
  )
}

// ── Results breakdown ────────────────────────────────────────────────────────

function ResultsPanel({
  tray,
  displayValues,
  finalResults,
  isRolling,
}: {
  tray: DieInTray[]
  displayValues: Record<string, number>
  finalResults: Record<string, number>
  isRolling: boolean
}) {
  const hasDisplay = tray.some(d => displayValues[d.id] != null)
  if (!hasDisplay) return null

  const isSettled = !isRolling && tray.every(d => finalResults[d.id] != null)
  const total = isSettled
    ? tray.reduce((sum, d) => sum + (finalResults[d.id] ?? 0), 0)
    : null

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {tray.map(die => {
          const val = finalResults[die.id] ?? displayValues[die.id]
          if (val == null) return null
          return (
            <span key={die.id} className="font-mono text-sm text-[var(--color-text)]">
              <span className="text-[var(--color-muted)]">d{die.sides}:</span>
              {' '}
              <span
                className="font-semibold"
                style={{ color: DIE_BG[die.sides] }}
              >
                {val}
              </span>
            </span>
          )
        })}
      </div>
      {total != null && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-baseline gap-2">
          <span className="text-xs text-[var(--color-muted)] uppercase tracking-wide font-semibold">Total</span>
          <span className="font-bold text-xl text-[var(--color-text)]">{total}</span>
          {tray.length > 1 && (
            <span className="text-xs text-[var(--color-muted)]">
              ({tray.map(d => `d${d.sides}`).join(' + ')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main card component ──────────────────────────────────────────────────────

interface DiceRollerCardProps {
  onRemove: () => void
  hideHeader?: boolean
}

export function DiceRollerCard({ onRemove, hideHeader }: DiceRollerCardProps) {
  const [tray, setTray] = useState<DieInTray[]>([])
  const [displayValues, setDisplayValues] = useState<Record<string, number>>({})
  const [finalResults, setFinalResults] = useState<Record<string, number>>({})
  const [isRolling, setIsRolling] = useState(false)
  const [d6RollKey, setD6RollKey] = useState(0)
  const [d6TargetFace, setD6TargetFace] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  function addDie(sides: DiceSides) {
    setTray(prev => [...prev, { id: uuid(), sides }])
  }

  function removeDie(id: string) {
    setTray(prev => prev.filter(d => d.id !== id))
    setDisplayValues(prev => { const n = { ...prev }; delete n[id]; return n })
    setFinalResults(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function clearAll() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setTray([])
    setDisplayValues({})
    setFinalResults({})
    setIsRolling(false)
  }

  function handleRoll() {
    if (tray.length === 0 || isRolling) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    // Compute fair results immediately — animation is purely visual
    const finals: Record<string, number> = {}
    tray.forEach(d => { finals[d.id] = rollDie(d.sides) })

    // Set d6 target + increment rollKey before clearing finals so D6Canvas
    // can capture the target face before its animation effect fires
    const featuredD6 = tray.find(d => d.sides === 6)
    if (featuredD6) {
      setD6TargetFace(finals[featuredD6.id])
      setD6RollKey(k => k + 1)
    }

    setIsRolling(true)
    setFinalResults({})

    // Rapid display cycling: scramble numbers at 55ms intervals
    intervalRef.current = setInterval(() => {
      const display: Record<string, number> = {}
      tray.forEach(d => { display[d.id] = rollDie(d.sides) })
      setDisplayValues(display)
    }, 55)

    // Settle on final results after 680ms
    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      setDisplayValues(finals)
      setFinalResults(finals)
      setIsRolling(false)
    }, 680)
  }

  const inner = (
    <div className="flex flex-col gap-3 p-4 h-full">

      {/* ── Dice Palette ── */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">
          Dice palette — click to add to tray
        </div>
        <div className="flex flex-wrap gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
          {DICE_TYPES.map(sides => (
            <PaletteDie key={sides} sides={sides} onClick={() => addDie(sides)} />
          ))}
        </div>
      </div>

      {/* ── Roll Tray ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Roll tray
            {tray.length > 0 && (
              <span className="ml-1 text-[var(--color-text)] normal-case">
                — {tray.length} {tray.length === 1 ? 'die' : 'dice'}
              </span>
            )}
          </div>
          {tray.length > 0 && (
            <button
              onClick={clearAll}
              disabled={isRolling}
              className="text-xs text-[var(--color-muted)] hover:text-red-500 transition-colors disabled:opacity-40"
            >
              Clear all
            </button>
          )}
        </div>
        <div
          className={`rounded-xl border-2 transition-colors p-3 flex flex-wrap gap-3 items-start content-start min-h-[84px] ${
            tray.length === 0
              ? 'border-dashed border-[var(--color-border)] bg-slate-50'
              : 'border-[var(--color-border)] bg-white'
          }`}
        >
          {tray.length === 0 ? (
            <span className="text-xs text-[var(--color-muted)] self-center w-full text-center py-2">
              Click a die above to add it here
            </span>
          ) : (
            tray.map(die => (
              <TrayDie
                key={die.id}
                die={die}
                displayValue={displayValues[die.id]}
                isRolling={isRolling}
                onRemove={() => removeDie(die.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── 3D d6 roll stage (shown when tray contains at least one d6) ── */}
      {tray.some(d => d.sides === 6) && (
        <div className="flex justify-center bg-slate-50 rounded-xl border border-slate-100 py-1">
          <D6Canvas
            targetFace={d6TargetFace}
            rollKey={d6RollKey}
          />
        </div>
      )}

      {/* ── Roll button ── */}
      <button
        onClick={handleRoll}
        disabled={tray.length === 0 || isRolling}
        className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all
                   bg-[var(--color-accent)] text-white hover:opacity-90
                   active:scale-95 shadow-sm
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {isRolling ? '🎲 Rolling…' : '🎲 Roll!'}
      </button>

      {/* ── Results ── */}
      <ResultsPanel
        tray={tray}
        displayValues={displayValues}
        finalResults={finalResults}
        isRolling={isRolling}
      />

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
      <div className="flex-1 min-h-0 overflow-auto">
        {inner}
      </div>
    </div>
  )
}
