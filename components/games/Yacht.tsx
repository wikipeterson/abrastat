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

const NUM_DICE = 5
const NUM_TURNS = 13
const DIE_IDS = Array.from({ length: NUM_DICE }, (_, i) => `y${i}`)
const YACHT_FOOTER_BAND_HEIGHT = 112

export const YACHT_MAX_SCORE = 357

interface DieState {
  id: string
  value: number | null
  held: boolean
}

interface Props {
  onDone: (score: number) => void
}

function DieFace({
  value,
  held,
  onClick,
  disabled,
  label,
}: {
  value: number | null
  held: boolean
  onClick: () => void
  disabled: boolean
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={held ? 'Click to return to tray' : 'Click to hold out of tray'}
      className={[
        'relative flex h-14 w-14 items-center justify-center rounded-xl border font-black text-2xl transition-all select-none',
        held
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-sm'
          : 'border-[#0D4F49] bg-[#0D4F49] text-white hover:scale-105',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      {value ?? '?'}
      {label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </span>
      )}
    </button>
  )
}

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
  const isScored = scoredValue !== undefined
  const clickable = !isScored && canScore
  const hasPoints = potential !== null && potential > 0
  const zeroPick = potential === 0

  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={[
        'w-full rounded-lg px-2.5 py-2 text-xs transition-all',
        'flex items-center justify-between border',
        isScored
          ? 'cursor-default border-slate-100 bg-slate-50'
          : clickable
            ? mustScore || hasPoints
              ? 'cursor-pointer border-transparent hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]'
              : 'cursor-pointer border-transparent hover:border-red-200 hover:bg-red-50'
            : 'cursor-default opacity-50 border-transparent',
      ].join(' ')}
    >
      <span className="font-medium text-[var(--color-text)]">{cat.label}</span>
      <span
        className={[
          'w-8 text-right font-bold tabular-nums',
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

export function Yacht({ onDone }: Props) {
  const canvasRef = useRef<D6CanvasHandle>(null)

  const [scores, setScores] = useState<Partial<Record<CategoryId, number>>>({})
  const [turn, setTurn] = useState(0)
  const [rollsLeft, setRollsLeft] = useState(3)
  const [isRolling, setIsRolling] = useState(false)
  const [showRollOverlay, setShowRollOverlay] = useState(true)
  const [dice, setDice] = useState<DieState[]>(
    DIE_IDS.map(id => ({ id, value: null, held: false })),
  )

  const rollingIdsRef = useRef<Set<string>>(new Set())
  const settledValRef = useRef<Map<string, number>>(new Map())

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
    if (
      rollingIdsRef.current.size > 0 &&
      [...rollingIdsRef.current].every(rid => settledValRef.current.has(rid))
    ) {
      setIsRolling(false)
      if (rollsLeft === 0) {
        const heldToRestore = dice.filter(d => d.held && d.value !== null)
        heldToRestore.forEach(d => {
          canvasRef.current?.addDie(d.id, 6, d.value ?? undefined)
        })
        setDice(prev => prev.map(d => ({ ...d, held: false })))
      }
    }
  }

  function roll() {
    if (rollsLeft <= 0 || isRolling) return
    const activeIds = dice.filter(d => !d.held).map(d => d.id)
    if (activeIds.length === 0) return

    setShowRollOverlay(false)
    rollingIdsRef.current = new Set(activeIds)
    for (const id of activeIds) settledValRef.current.delete(id)

    setDice(prev => prev.map(d => activeIds.includes(d.id) ? { ...d, value: null } : d))
    setIsRolling(true)
    setRollsLeft(r => r - 1)
    canvasRef.current?.rollAll()
  }

  function toggleHold(id: string) {
    if (rollsLeft === 3 || isRolling || rollsLeft === 0) return
    const die = dice.find(d => d.id === id)
    if (!die) return

    if (die.held) {
      canvasRef.current?.addDie(id, 6)
    } else {
      canvasRef.current?.removeDie(id)
    }
    setDice(prev => prev.map(d => d.id === id ? { ...d, held: !d.held } : d))
  }

  function scoreAndAdvance(catId: CategoryId) {
    if (scores[catId] !== undefined) return
    const vals = dice.map(d => d.value ?? 0)
    const points = scoreCategory(catId, vals)
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
    setShowRollOverlay(true)
    rollingIdsRef.current = new Set()
    settledValRef.current = new Map()
    canvasRef.current?.clearAll()
    DIE_IDS.forEach(id => canvasRef.current?.addDie(id, 6))
    setDice(DIE_IDS.map(id => ({ id, value: null, held: false })))
  }

  const hasRolled = rollsLeft < 3
  const mustScore = rollsLeft === 0 && !isRolling
  const canScore = hasRolled && !isRolling
  const diceValues = dice.map(d => d.value ?? 0)
  const holdable = hasRolled && !isRolling && rollsLeft > 0
  const activeDice = dice.filter(d => !d.held)
  const heldDice = dice.filter(d => d.held)
  const canShowRollOverlay = showRollOverlay && !isRolling && rollsLeft > 0 && activeDice.length > 0

  const { upperSubtotal, lowerSubtotal, grandTotal } = computeTotals(scores)
  const upperCats = CATEGORIES.filter(c => c.section === 'upper')
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower')

  function potential(cat: CategoryDef): number | null {
    if (scores[cat.id] !== undefined) return null
    if (!hasRolled) return null
    return scoreCategory(cat.id, diceValues)
  }

  const upperFilled = UPPER_IDS.filter(id => scores[id] !== undefined).length
  const upperNeeded = Math.max(0, 63 - upperSubtotal)
  const bonusAchieved = upperSubtotal >= 63
  const bonusLabel = bonusAchieved ? '+35 ✓' : upperFilled > 0 ? `need ${upperNeeded} more` : '—'

  return (
    <div className="grid items-stretch gap-4 xl:grid-cols-[1.45fr_1fr]">
      <div className="flex h-full flex-col">
        <div className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-white p-3">
          <div className="relative flex-1 overflow-hidden rounded-xl" style={{ minHeight: 310 }}>
            <D6Canvas
              ref={canvasRef}
              onDieSettled={handleDieSettled}
              onDieClick={toggleHold}
              onLineupComplete={() => setShowRollOverlay(true)}
            />
            {canShowRollOverlay && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <button
                  onClick={roll}
                  className="pointer-events-auto rounded-2xl border-2 border-[var(--color-accent)] bg-white px-10 py-4 text-2xl font-bold text-[var(--color-accent)] shadow-lg transition-all hover:bg-[var(--color-accent)] hover:text-white"
                >
                  {rollsLeft === 3 ? 'Roll Dice' : `Roll Again (${rollsLeft} left)`}
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto pt-3">
            <div>
            <div className="flex h-full flex-col">
              <div
                className="flex flex-wrap content-start gap-3 rounded-xl border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-light)]/50 p-3"
                style={{ height: YACHT_FOOTER_BAND_HEIGHT }}
              >
                {heldDice.length === 0 ? (
                  <div className="flex items-center text-xs text-[var(--color-muted)]">Click a die in the tray to hold it out. Click a held die to return it.</div>
                ) : (
                  heldDice.map(d => (
                    <DieFace
                      key={d.id}
                      value={d.value}
                      held
                      onClick={() => toggleHold(d.id)}
                      disabled={!holdable}
                      label="Click to return"
                    />
                  ))
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full flex-col space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Scorecard</div>
            <div className="text-xs text-[var(--color-muted)]">
              {mustScore ? 'Choose a category now.' : 'Potential scores update after each roll.'}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-[var(--color-muted)]">Bonus progress</div>
            <div className={`font-bold ${bonusAchieved ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
              {upperSubtotal} / 63
            </div>
          </div>
        </div>

        <div className="flex-1">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div>
            <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
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

            <div className="mx-2.5 mt-1 space-y-0.5 border-t border-[var(--color-border)] pt-1">
              <div className="flex justify-between text-xs text-[var(--color-muted)]">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums">{upperSubtotal} / 63</span>
              </div>
              <div
                className={[
                  'flex justify-between text-xs font-medium',
                  bonusAchieved ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
                ].join(' ')}
              >
                <span>Bonus</span>
                <span className="tabular-nums">{bonusLabel}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
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

            <div className="mx-2.5 mt-1 border-t border-[var(--color-border)] pt-1">
              <div className="flex justify-between text-xs text-[var(--color-muted)]">
                <span>Lower Total</span>
                <span className="font-bold tabular-nums">{lowerSubtotal}</span>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div
          className="mt-auto rounded-xl border border-[var(--color-border)] px-3 py-3"
          style={{ height: YACHT_FOOTER_BAND_HEIGHT }}
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Upper</div>
              <div className="text-xl font-black tabular-nums text-[var(--color-text)]">
                {upperSubtotal + (bonusAchieved ? 35 : 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Lower</div>
              <div className="text-xl font-black tabular-nums text-[var(--color-text)]">{lowerSubtotal}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Grand Total</div>
              <div className="text-3xl font-black tabular-nums text-[var(--color-accent)]">{grandTotal}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
