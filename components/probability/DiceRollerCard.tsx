'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { v4 as uuid } from 'uuid'
import { D6Canvas, D6CanvasHandle, DEFAULT_DICE_TUNING, DiceTuning } from './D6Canvas'
import { useStore } from '@/lib/store'
import { DiceRollerCardConfig } from '@/lib/exploreTypes'

// ── Dice configuration ────────────────────────────────────────────────────────

const DICE_TYPES = [6, 10, 100] as const
type DiceSides = typeof DICE_TYPES[number]
const DICE_STAGE_ASPECT = 10.96 / 6.66

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

function ResultsDotPlot({
  values,
  label,
  minValue,
  maxValue,
  color,
}: {
  values: number[]
  label: string
  minValue: number
  maxValue: number
  color: string
}) {
  const marginL = 48
  const marginR = 20
  const marginT = 16
  const marginB = 38
  const svgW = 420
  const svgH = 300
  const plotW = svgW - marginL - marginR
  const plotH = svgH - marginT - marginB

  const counts: Record<number, number> = {}
  for (const v of values) counts[v] = (counts[v] || 0) + 1
  const maxStack = Math.max(...Object.values(counts), 1)
  const stackStep = Math.min(14, plotH / maxStack)
  const r = Math.max(2.5, Math.min(5, stackStep / 2 - 0.4))

  const range = maxValue > minValue ? maxValue - minValue : 1
  const xScale = (v: number) => marginL + ((v - minValue) / range) * plotW
  const yBase = marginT + plotH

  const dots: { cx: number; cy: number }[] = []
  for (const [vStr, count] of Object.entries(counts)) {
    const v = Number(vStr)
    const cx = xScale(v)
    for (let i = 0; i < count; i++) {
      dots.push({ cx, cy: yBase - r - i * stackStep })
    }
  }

  const tickStep = Math.max(1, Math.ceil(range / 8))
  const ticks: number[] = []
  for (let t = minValue; t <= maxValue; t += tickStep) ticks.push(t)
  if (ticks[ticks.length - 1] !== maxValue) ticks.push(maxValue)

  return (
    <div className="h-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-[var(--color-text)]">{label}</div>
      {values.length === 0 ? (
        <div className="flex h-[calc(100%-1.5rem)] min-h-[320px] items-center justify-center rounded-xl bg-slate-50 text-sm text-[var(--color-muted)]">
          Roll the dice to build the dot plot.
        </div>
      ) : (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', width: '100%', height: '100%', minHeight: '320px' }}
        >
          <line x1={marginL} y1={yBase + 1} x2={marginL + plotW} y2={yBase + 1} stroke="#CBD5E1" strokeWidth={1.2} />
          {ticks.map(t => (
            <g key={t}>
              <line x1={xScale(t)} y1={yBase + 1} x2={xScale(t)} y2={yBase + 6} stroke="#94A3B8" strokeWidth={1} />
              <text x={xScale(t)} y={yBase + 20} textAnchor="middle" fontSize={12} fill="#475569">{t}</text>
            </g>
          ))}
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={r} fill={color} opacity={0.82} />
          ))}
        </svg>
      )}
    </div>
  )
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
  const [rollHistory, setRollHistory] = useState<number[][]>([])
  const [showGraph, setShowGraph] = useState(false)
  const [graphMode, setGraphMode] = useState<'sum' | 'difference'>('sum')
  const [tuning] = useState<DiceTuning>(DEFAULT_DICE_TUNING)
  const [viewportHeight, setViewportHeight] = useState(900)
  const canvasRef = useRef<D6CanvasHandle>(null)
  const rollAudioRef = useRef<HTMLAudioElement | null>(null)
  const thudPoolRef = useRef<HTMLAudioElement[]>([])
  const thudIndexRef = useRef(0)
  const audioPrimedRef = useRef(false)

  // ── Store connections for linked results ──────────────────────────────────
  const exploreCards      = useStore(s => s.exploreCards)
  const updateExploreCard = useStore(s => s.updateExploreCard)
  const addSimResultsCard = useStore(s => s.addSimResultsCard)
  const pushSimResult     = useStore(s => s.pushSimResult)

  const diceConfig = cardId
    ? (exploreCards.find(c => c.id === cardId)?.config as DiceRollerCardConfig | undefined)
    : undefined
  const linkedResultsCardId = diceConfig?.linkedResultsCardId ?? null

  // Read trackedMode from the linked results card (source of truth)
  const linkedCard = exploreCards.find(c => c.id === linkedResultsCardId)
  const trackedMode = (linkedCard?.config.type === 'sim-results' ? linkedCard.config.trackedMode : null) ?? 'sum'

  const rollInProgressRef = useRef(false)

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

  // Count of each die type currently in tray
  const dieCounts = DICE_TYPES.reduce((acc, s) => {
    acc[s] = tray.filter(d => d.sides === s).length
    return acc
  }, {} as Record<DiceSides, number>)

  function addDie(sides: DiceSides) {
    const id = uuid()
    setRollHistory([])
    setFinalResults({})
    setTray(prev => [...prev, { id, sides }])
    canvasRef.current?.addDie(id, sides)
  }

  function generateSimulatedRolls(count: number): number[][] {
    if (tray.length === 0 || count <= 0) return []
    return Array.from({ length: count }, () =>
      tray.map(die => Math.floor(Math.random() * die.sides) + 1),
    )
  }

  async function rollAll() {
    setFinalResults({})
    rollInProgressRef.current = true
    await primeAudio()
    playRollSound()
    canvasRef.current?.rollAll()
  }

  function fastRollMany(count: number) {
    if (tray.length === 0 || count <= 0) return
    const simulatedRolls = generateSimulatedRolls(count)
    if (simulatedRolls.length === 0) return

    setRollHistory(prev => [...prev, ...simulatedRolls])

    if (!linkedResultsCardId) return
    simulatedRolls.forEach(roll => pushSimResult(linkedResultsCardId, roll))
  }

  // ── Roll-complete detection → push tracked value to linked results ──────────
  useEffect(() => {
    if (!rollInProgressRef.current) return
    if (tray.length === 0) return
    if (!tray.every(d => finalResults[d.id] != null)) return

    rollInProgressRef.current = false

    const settled = tray.map(d => finalResults[d.id]).filter((v): v is number => v != null)
    setRollHistory(prev => [...prev, settled])

    if (!linkedResultsCardId) return
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
  const effectiveGraphMode = graphMode === 'difference' && supportsDifference ? 'difference' : 'sum'
  const graphRange = getTrackedRange(tray, effectiveGraphMode)
  const graphValues = useMemo(
    () => deriveTrackedValues(rollHistory, effectiveGraphMode),
    [rollHistory, effectiveGraphMode],
  )
  const stageHeight = hideHeader
    ? 'clamp(420px, calc(100vh - 11rem), 760px)'
    : 'clamp(360px, 62vh, 760px)'
  const stageMaxWidth = hideHeader
    ? Math.max(760, Math.min(1320, (viewportHeight - 176) * DICE_STAGE_ASPECT))
    : undefined

  useEffect(() => {
    function updateViewportHeight() {
      setViewportHeight(window.innerHeight)
    }

    updateViewportHeight()
    window.addEventListener('resize', updateViewportHeight)
    return () => window.removeEventListener('resize', updateViewportHeight)
  }, [])

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

  useEffect(() => {
    if (graphMode === 'difference' && !supportsDifference) {
      setGraphMode('sum')
    }
  }, [graphMode, supportsDifference])

  function clearAll() {
    canvasRef.current?.clearAll()
    setTray([])
    setFinalResults({})
    setRollHistory([])
  }

  function handleDieSettled(id: string, value: number) {
    playThudSound(0.35)
    setFinalResults(prev => ({ ...prev, [id]: value }))
  }

  function handleLineupComplete() {
    playThudSound(0.5)
  }

  const inner = (
    <div className="flex flex-col h-full">

      {/* ── Palette ── */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-[var(--color-border)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {DICE_TYPES.map(sides => (
              <PaletteDie
                key={sides}
                sides={sides}
                count={dieCounts[sides]}
                onClick={() => addDie(sides)}
              />
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={showGraph}
              onChange={e => setShowGraph(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
            />
            <span className="font-medium">Graph results</span>
          </label>

          {showGraph && (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white p-1">
              {(['sum', 'difference'] as const).map(mode => {
                const disabled = mode === 'difference' && !supportsDifference
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setGraphMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      effectiveGraphMode === mode
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'text-[var(--color-muted)] hover:bg-slate-50'
                    } ${disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent' : ''}`}
                  >
                    {mode === 'sum' ? 'Sum' : 'Difference'}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex-1 min-w-0" />

          {cardId && (
            <button
              onClick={handleTrackResults}
              className={`rounded-lg py-2 px-3 text-sm transition-colors border whitespace-nowrap ${
                hasLinkedCard
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
              }`}
            >
              {hasLinkedCard ? '📊 Results linked' : '📊 Link results'}
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={rollAll}
              disabled={tray.length === 0}
              className="rounded-xl bg-[var(--color-accent)] text-white font-semibold px-5 py-2.5
                         disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 transition"
            >
              Roll
            </button>
            {showGraph && (
              <button
                onClick={() => fastRollMany(10)}
                disabled={tray.length === 0}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold
                           text-[var(--color-text)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                Roll 10
              </button>
            )}
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
      </div>

      {/* ── Physics tray ───────────────────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 px-3 py-3 ${showGraph ? 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]' : 'grid place-items-center'}`}
        style={{ height: stageHeight }}
      >
        <div
          className={`${showGraph ? 'h-full w-full' : 'h-full w-full'}`}
          style={{
            aspectRatio: `${DICE_STAGE_ASPECT}`,
            maxWidth: stageMaxWidth ? `${stageMaxWidth}px` : undefined,
            justifySelf: showGraph ? 'stretch' : 'center',
          }}
        >
          <D6Canvas
            ref={canvasRef}
            onDieSettled={handleDieSettled}
            onLineupComplete={handleLineupComplete}
            tuning={tuning}
          />
        </div>

        {showGraph && (
          <ResultsDotPlot
            values={graphValues}
            label={effectiveGraphMode === 'sum' ? 'Dot Plot of Roll Sums' : 'Dot Plot of Roll Differences'}
            minValue={graphRange.minValue}
            maxValue={graphRange.maxValue}
            color={effectiveGraphMode === 'sum' ? '#0EA5A0' : '#8B5CF6'}
          />
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
