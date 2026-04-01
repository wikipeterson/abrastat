'use client'

import { useEffect, useRef, useState } from 'react'
import { D6Canvas, D6CanvasHandle } from '@/components/probability/D6Canvas'
import {
  scoreCategory,
  computeTotals,
  CATEGORIES,
  UPPER_IDS,
  CategoryId,
  CategoryDef,
} from '@/lib/yachtScoring'

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_DICE  = 5
const NUM_TURNS = 13
const DIE_IDS   = Array.from({ length: NUM_DICE }, (_, i) => `y${i}`)

// Max theoretical score: upper 105 + bonus 35 + lower 217 = 357
export const YACHT_MAX_SCORE = 357

// ── Types ─────────────────────────────────────────────────────────────────────

interface DieState {
  id: string
  value: number | null
  held: boolean
}

interface Props {
  onDone: (score: number) => void
}

// ── Die face button ───────────────────────────────────────────────────────────

function DieFace({
  value,
  held,
  onClick,
  disabled,
}: {
  value: number | null
  held: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={held ? 'Click to unhold' : 'Click to hold'}
      className={[
        'relative flex items-center justify-center w-14 h-14 rounded-xl',
        'font-black text-2xl transition-all select-none',
        held
          ? 'bg-[var(--color-accent)] text-white shadow-md scale-105 ring-2 ring-offset-2 ring-[var(--color-accent)]'
          : 'bg-[#0D4F49] text-white hover:scale-105',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {value ?? '?'}
      {held && (
        <span className="absolute -top-1.5 -right-1.5 bg-white text-[var(--color-accent)] text-[8px] font-bold rounded-full px-1 leading-4">
          HELD
        </span>
      )}
    </button>
  )
}

// ── Scorecard row ─────────────────────────────────────────────────────────────

function ScoreRow({
  cat,
  scoredValue,
  potential,
  canScore,
  mustScore,
  onClick,
}: {
  cat: CategoryDef
  scoredValue: number | undefined
  potential: number | null
  canScore: boolean
  mustScore: boolean
  onClick: () => void
}) {
  const isScored   = scoredValue !== undefined
  const clickable  = !isScored && canScore
  const hasPoints  = potential !== null && potential > 0
  const zeroPick   = potential === 0

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={[
        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all',
        isScored
          ? 'bg-slate-50 cursor-default'
          : clickable
            ? mustScore || hasPoints
              ? 'hover:bg-[var(--color-accent-light)] cursor-pointer'
              : 'hover:bg-red-50 cursor-pointer'
            : 'opacity-50 cursor-default',
      ].join(' ')}
    >
      <span className="font-medium text-[var(--color-text)]">{cat.label}</span>
      <span
        className={[
          'font-bold tabular-nums w-8 text-right',
          isScored
            ? 'text-[var(--color-text)]'
            : hasPoints
              ? 'text-[var(--color-accent)]'
              : zeroPick
                ? 'text-red-400'
                : 'text-[var(--color-muted)]',
        ].join(' ')}
      >
        {isScored ? scoredValue : potential !== null ? potential : '—'}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Yacht({ onDone }: Props) {
  const canvasRef = useRef<D6CanvasHandle>(null)

  const [scores,     setScores]     = useState<Partial<Record<CategoryId, number>>>({})
  const [turn,       setTurn]       = useState(0)
  const [rollsLeft,  setRollsLeft]  = useState(3)
  const [isRolling,  setIsRolling]  = useState(false)
  const [dice,       setDice]       = useState<DieState[]>(
    DIE_IDS.map(id => ({ id, value: null, held: false })),
  )

  // Refs for settlement tracking (avoids closure-stale state issues)
  const rollingIdsRef = useRef<Set<string>>(new Set())
  const settledValRef = useRef<Map<string, number>>(new Map())

  // Add 5 d6 dice once on mount
  useEffect(() => {
    const handle = canvasRef.current
    if (!handle) return
    DIE_IDS.forEach(id => handle.addDie(id, 6))
    return () => {
      DIE_IDS.forEach(id => handle.removeDie(id))
    }
  }, [])

  function handleDieSettled(id: string, value: number) {
    settledValRef.current.set(id, value)
    setDice(prev => prev.map(d => d.id === id ? { ...d, value } : d))
    // All rolling dice settled?
    if (rollingIdsRef.current.size > 0 &&
        [...rollingIdsRef.current].every(rid => settledValRef.current.has(rid))) {
      setIsRolling(false)
    }
  }

  function roll() {
    if (rollsLeft <= 0 || isRolling) return
    const toRoll = dice.filter(d => !d.held).map(d => d.id)
    if (toRoll.length === 0) return

    // Reset settlement tracking for this roll
    rollingIdsRef.current = new Set(toRoll)
    for (const id of toRoll) settledValRef.current.delete(id)

    setDice(prev => prev.map(d => toRoll.includes(d.id) ? { ...d, value: null } : d))
    setIsRolling(true)
    setRollsLeft(r => r - 1)
    canvasRef.current?.rollSome(toRoll)
  }

  function toggleHold(id: string) {
    // Can only hold after at least one roll, while dice are not in motion
    if (rollsLeft === 3 || isRolling || rollsLeft === 0) return
    setDice(prev => prev.map(d => d.id === id ? { ...d, held: !d.held } : d))
  }

  function scoreAndAdvance(catId: CategoryId) {
    if (scores[catId] !== undefined) return
    const vals     = dice.map(d => d.value ?? 0)
    const points   = scoreCategory(catId, vals)
    const newScores = { ...scores, [catId]: points }
    setScores(newScores)

    const nextTurn = turn + 1
    if (nextTurn >= NUM_TURNS) {
      onDone(computeTotals(newScores).grandTotal)
      return
    }

    setTurn(nextTurn)
    setRollsLeft(3)
    setIsRolling(false)
    rollingIdsRef.current = new Set()
    settledValRef.current = new Map()
    setDice(DIE_IDS.map(id => ({ id, value: null, held: false })))
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const hasRolled  = rollsLeft < 3
  const mustScore  = rollsLeft === 0 && !isRolling
  const canScore   = hasRolled && !isRolling
  const diceValues = dice.map(d => d.value ?? 0)
  const holdable   = hasRolled && !isRolling && rollsLeft > 0

  const { upperSubtotal, lowerSubtotal, grandTotal } = computeTotals(scores)
  const upperCats = CATEGORIES.filter(c => c.section === 'upper')
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower')

  function potential(cat: CategoryDef): number | null {
    if (scores[cat.id] !== undefined) return null
    if (!hasRolled) return null
    return scoreCategory(cat.id, diceValues)
  }

  // Bonus progress
  const upperFilled     = UPPER_IDS.filter(id => scores[id] !== undefined).length
  const upperNeeded     = 63 - upperSubtotal
  const bonusAchieved   = upperSubtotal >= 63
  const bonusLabel      = bonusAchieved
    ? '+35 ✓'
    : upperFilled > 0
      ? `need ${upperNeeded} more`
      : '—'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Turn / roll info strip */}
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span className="font-semibold">
          Turn {Math.min(turn + 1, NUM_TURNS)} / {NUM_TURNS}
        </span>
        <span>
          {rollsLeft === 3 ? 'Roll to start' : `${rollsLeft} roll${rollsLeft !== 1 ? 's' : ''} left`}
        </span>
        <span className="font-bold text-[var(--color-text)] tabular-nums">
          Score: {grandTotal}
        </span>
      </div>

      {/* 3-D dice canvas */}
      <div className="rounded-xl overflow-hidden" style={{ height: 220 }}>
        <D6Canvas
          ref={canvasRef}
          onDieSettled={handleDieSettled}
          disableLineup
        />
      </div>

      {/* Hold buttons */}
      <div className="flex items-center justify-center gap-3">
        {dice.map(d => (
          <DieFace
            key={d.id}
            value={d.value}
            held={d.held}
            onClick={() => toggleHold(d.id)}
            disabled={!holdable}
          />
        ))}
      </div>

      {/* Roll / must-score message */}
      <div className="flex flex-col items-center gap-1.5">
        {mustScore && (
          <p className="text-xs text-amber-600 font-medium">
            No rolls remaining — choose a category below.
          </p>
        )}
        <button
          onClick={roll}
          disabled={rollsLeft === 0 || isRolling}
          className={[
            'w-full py-2.5 rounded-xl text-sm font-bold transition-all',
            rollsLeft > 0 && !isRolling
              ? 'bg-[var(--color-accent)] text-white hover:opacity-90 shadow-sm'
              : 'bg-slate-100 text-[var(--color-muted)] cursor-not-allowed',
          ].join(' ')}
        >
          {isRolling
            ? 'Rolling…'
            : rollsLeft === 3
              ? 'Roll Dice'
              : rollsLeft === 0
                ? 'No rolls left'
                : `Roll Again (${rollsLeft} left)`
          }
        </button>
      </div>

      {/* Scorecard — two-column grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">

        {/* Upper section */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1 px-2.5">
            Upper Section
          </div>
          {upperCats.map(cat => (
            <ScoreRow
              key={cat.id}
              cat={cat}
              scoredValue={scores[cat.id]}
              potential={potential(cat)}
              canScore={canScore}
              mustScore={mustScore}
              onClick={() => scoreAndAdvance(cat.id)}
            />
          ))}

          {/* Upper totals */}
          <div className="mt-1 mx-2.5 pt-1 border-t border-[var(--color-border)] space-y-0.5">
            <div className="flex justify-between text-xs text-[var(--color-muted)]">
              <span>Subtotal</span>
              <span className="font-bold tabular-nums">{upperSubtotal} / 63</span>
            </div>
            <div className={[
              'flex justify-between text-xs font-medium',
              bonusAchieved ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
            ].join(' ')}>
              <span>Bonus</span>
              <span className="tabular-nums">{bonusLabel}</span>
            </div>
          </div>
        </div>

        {/* Lower section */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1 px-2.5">
            Lower Section
          </div>
          {lowerCats.map(cat => (
            <ScoreRow
              key={cat.id}
              cat={cat}
              scoredValue={scores[cat.id]}
              potential={potential(cat)}
              canScore={canScore}
              mustScore={mustScore}
              onClick={() => scoreAndAdvance(cat.id)}
            />
          ))}

          {/* Lower total */}
          <div className="mt-1 mx-2.5 pt-1 border-t border-[var(--color-border)]">
            <div className="flex justify-between text-xs text-[var(--color-muted)]">
              <span>Lower Total</span>
              <span className="font-bold tabular-nums">{lowerSubtotal}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grand total footer */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl border border-[var(--color-border)]">
        <div className="space-y-0.5">
          <div className="flex gap-4 text-xs text-[var(--color-muted)]">
            <span>Upper: {upperSubtotal}{bonusAchieved ? ' +35' : ''}</span>
            <span>Lower: {lowerSubtotal}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">Grand Total</div>
          <div className="text-2xl font-black tabular-nums text-[var(--color-accent)]">{grandTotal}</div>
        </div>
      </div>
    </div>
  )
}
