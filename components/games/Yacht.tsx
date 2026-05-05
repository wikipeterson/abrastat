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
const NUM_TURNS = 12
const DIE_IDS = Array.from({ length: NUM_DICE }, (_, i) => `y${i}`)
const ZONE_RETURN_MS = 350

export const YACHT_MAX_SCORE = 304

interface DieState {
  id: string
  value: number | null
  held: boolean
}

interface Props {
  onDone: (score: number) => void
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
  const diceInitializedRef = useRef(false)
  const rollAudioRef = useRef<HTMLAudioElement | null>(null)
  const thudPoolRef = useRef<HTMLAudioElement[]>([])
  const thudIndexRef = useRef(0)
  const audioPrimedRef = useRef(false)

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
  const [returningHeld, setReturningHeld] = useState(false)

  useEffect(() => {
    const handle = canvasRef.current
    return () => {
      handle?.clearAll()
    }
  }, [])

  useEffect(() => {
    rollAudioRef.current = new Audio('/sounds/dieroll.mp3')
    rollAudioRef.current.preload = 'auto'
    rollAudioRef.current.volume = 0.8
    rollAudioRef.current.load()

    thudPoolRef.current = Array.from({ length: 8 }, () => {
      const audio = new Audio('/sounds/thud.mp3')
      audio.preload = 'auto'
      audio.volume = 0.75
      audio.load()
      return audio
    })

    return () => {
      rollAudioRef.current?.pause()
      if (rollAudioRef.current) rollAudioRef.current.src = ''
      thudPoolRef.current.forEach(audio => {
        audio.pause()
        audio.src = ''
      })
      thudPoolRef.current = []
    }
  }, [])

  async function primeAudio() {
    if (audioPrimedRef.current) return
    audioPrimedRef.current = true

    const audios = [rollAudioRef.current, ...thudPoolRef.current].filter((audio): audio is HTMLAudioElement => !!audio)
    await Promise.allSettled(
      audios.map(async audio => {
        const originalMuted = audio.muted
        const originalVolume = audio.volume
        try {
          audio.muted = true
          audio.volume = 0
          audio.currentTime = 0
          await audio.play()
          audio.pause()
          audio.currentTime = 0
        } finally {
          audio.muted = originalMuted
          audio.volume = originalVolume
        }
      }),
    )
  }

  function playRollSound() {
    const audio = rollAudioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    void audio.play().catch(() => {
      audioPrimedRef.current = false
    })
  }

  function playThudSound(volume = 0.45) {
    const pool = thudPoolRef.current
    if (pool.length === 0) return
    const audio = pool[thudIndexRef.current % pool.length]
    thudIndexRef.current += 1
    audio.pause()
    audio.currentTime = 0
    audio.volume = volume
    void audio.play().catch(() => {
      audioPrimedRef.current = false
    })
  }

  function handleDieSettled(id: string, value: number) {
    if (!rollingIdsRef.current.has(id)) return
    playThudSound(0.35)
    settledValRef.current.set(id, value)
    setDice(prev => prev.map(d => d.id === id ? { ...d, value } : d))
    if ([...rollingIdsRef.current].every(rid => settledValRef.current.has(rid))) {
      setIsRolling(false)
      // After the last roll, animate held dice back to the tray before scoring
      if (rollsLeft === 0) {
        setDice(prev => {
          const held = prev.filter(d => d.held)
          if (held.length > 0) {
            setReturningHeld(true)
            held.forEach(d => canvasRef.current?.setDieZone(d.id, 'tray'))
            setTimeout(() => setReturningHeld(false), ZONE_RETURN_MS)
          }
          return prev.map(d => ({ ...d, held: false }))
        })
      }
    }
  }

  async function roll() {
    if (rollsLeft <= 0 || isRolling) return

    if (!diceInitializedRef.current) {
      const handle = canvasRef.current
      if (!handle) return
      DIE_IDS.forEach(id => handle.addDie(id, 6))
      diceInitializedRef.current = true
    }

    const activeIds = dice.filter(d => !d.held).map(d => d.id)
    if (activeIds.length === 0) return

    setShowRollOverlay(false)
    rollingIdsRef.current = new Set(activeIds)
    for (const id of activeIds) settledValRef.current.delete(id)

    setDice(prev => prev.map(d => activeIds.includes(d.id) ? { ...d, value: null } : d))
    setIsRolling(true)
    setRollsLeft(r => r - 1)
    await primeAudio()
    playRollSound()
    canvasRef.current?.rollSome(activeIds)
  }

  function toggleHold(id: string) {
    if (rollsLeft === 3 || isRolling || rollsLeft === 0) return
    setDice(prev => {
      const die = prev.find(d => d.id === id)
      if (!die) return prev
      const newHeld = !die.held
      canvasRef.current?.setDieZone(id, newHeld ? 'held' : 'tray')
      return prev.map(d => d.id === id ? { ...d, held: newHeld } : d)
    })
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
    if (diceInitializedRef.current) {
      canvasRef.current?.clearAll()
      diceInitializedRef.current = false
    }
    setDice(DIE_IDS.map(id => ({ id, value: null, held: false })))
  }

  const hasRolled = rollsLeft < 3
  const mustScore = rollsLeft === 0 && !isRolling
  const canScore = hasRolled && !isRolling && !returningHeld
  const diceValues = dice.map(d => d.value ?? 0)
  const activeDice = dice.filter(d => !d.held)
  const canShowRollOverlay = showRollOverlay && !isRolling && activeDice.length > 0

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
    <div className="grid items-stretch gap-4 xl:grid-cols-[1.75fr_0.95fr]">
      <div className="flex h-full flex-col">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
          <div
            className="relative flex-1 overflow-hidden bg-white"
            style={{ minHeight: 620 }}
          >
            <D6Canvas
              ref={canvasRef}
              onDieSettled={handleDieSettled}
              onDieClick={toggleHold}
              onLineupComplete={() => {
                playThudSound(0.5)
                setShowRollOverlay(true)
              }}
              enableHeldZone
            />
            {canShowRollOverlay && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[76%] items-center justify-center">
                <button
                  onClick={rollsLeft > 0 ? roll : undefined}
                  className={[
                    'pointer-events-auto rounded-2xl border-2 border-[var(--color-accent)] bg-white px-10 py-4 text-2xl font-bold text-[var(--color-accent)] shadow-lg transition-all',
                    rollsLeft > 0
                      ? 'hover:bg-[var(--color-accent)] hover:text-white'
                      : 'cursor-default',
                  ].join(' ')}
                >
                  {rollsLeft === 0 ? 'Mark It!' : rollsLeft === 3 ? 'Roll Dice' : `Roll Again (${rollsLeft} left)`}
                </button>
              </div>
            )}
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
          <div className="text-right text-xs space-y-1">
            <div className="font-semibold text-[var(--color-text)]">Round {Math.min(turn + 1, NUM_TURNS)} / {NUM_TURNS}</div>
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
