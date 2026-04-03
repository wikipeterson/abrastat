'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

// ── Physics constants ─────────────────────────────────────────────────────────

const FRICTION_K            = 0.9   // base wheel friction (ticker adds extra braking)
const STOP_OMEGA            = 0.06  // rad/s — stop threshold
const TICKER_SPRING         = 300   // ticker spring return (rad/s² per rad deflection)
const TICKER_DAMPER         = 18    // damping (ζ ≈ 0.52 — underdamped for visible bounce)
const TICKER_IMPULSE        = 1.2   // upward angular velocity impulse to ticker per peg hit
const WHEEL_BRAKE_IMPULSE   = 0.28  // rad/s removed from wheel per peg crossing (discrete)
const TICKER_WHEEL_COUPLING = 14    // continuous coupling: deflection (rad) → wheel braking (rad/s² per rad)
const TICKER_MAX_ANGLE      = 0.06  // rad — mechanical stop (ticker rests against wheel rim)

// ── Canvas geometry ───────────────────────────────────────────────────────────

const CW            = 430  // canvas width (extra left room for ticker)
const CH            = 420  // canvas height
const WCX           = 225  // wheel center x
const WCY           = 210  // wheel center y
const WHEEL_R       = 178  // wheel sector radius
const RIM_R         = 182  // outer rim radius
const HUB_R         = 20   // center hub radius
const TICKER_PX     = 8    // ticker pivot x
const TICKER_PY     = WCY  // ticker pivot y (same height as wheel center)
const TICKER_LEN    = 50   // pivot → tip length
const TICKER_W      = 8    // half-width at base

// Ticker is fixed at the left of the wheel (world angle = π)
const TICKER_WORLD_ANGLE = Math.PI

// ── Color palette ─────────────────────────────────────────────────────────────

const WHEEL_COLORS = [
  '#2EC4B6', '#F5A623', '#6366F1', '#EF4444',
  '#10B981', '#EC4899', '#F97316', '#0891B2',
  '#84CC16', '#8B5CF6', '#E11D48', '#14B8A6',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sector {
  id:        string
  label:     string  // may be truncated for display
  fullLabel: string  // always the original label
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function normAngle(a: number): number {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

/** Index of the sector currently aligned with the ticker (angle = π). */
function sectorUnderTicker(wheelAngle: number, n: number): number {
  const sectorAngle = (2 * Math.PI) / n
  return Math.floor(normAngle(TICKER_WORLD_ANGLE - wheelAngle) / sectorAngle) % n
}

function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const f = (v: number) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

function buildNumberedSectors(n: number): Sector[] {
  return Array.from({ length: n }, (_, i) => ({
    id:        String(i),
    label:     String(i + 1),
    fullLabel: `Sector ${i + 1}`,
  }))
}

function buildCategorySectors(labels: string[]): Sector[] {
  return labels.map((lbl, i) => ({
    id:        String(i),
    label:     lbl.length > 13 ? lbl.slice(0, 12) + '…' : lbl,
    fullLabel: lbl,
  }))
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawWheel(
  ctx: CanvasRenderingContext2D,
  sectors: Sector[],
  wheelAngle: number,
  winnerId: string | null,
  showLabels: boolean,
) {
  const n = sectors.length
  if (n === 0) return
  const sectorAngle = (2 * Math.PI) / n

  ctx.save()
  ctx.translate(WCX, WCY)

  // Drop shadow (one pass before sectors)
  ctx.save()
  ctx.shadowColor  = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur   = 22
  ctx.shadowOffsetX = 4
  ctx.shadowOffsetY = 6
  ctx.beginPath()
  ctx.arc(0, 0, RIM_R, 0, 2 * Math.PI)
  ctx.fillStyle = '#CBD5E1'
  ctx.fill()
  ctx.restore()

  ctx.rotate(wheelAngle)

  // Sectors
  for (let i = 0; i < n; i++) {
    const startA   = i * sectorAngle
    const endA     = (i + 1) * sectorAngle
    const midA     = (startA + endA) / 2
    const color    = WHEEL_COLORS[i % WHEEL_COLORS.length]
    const isWinner = sectors[i].id === winnerId

    // Fill
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, WHEEL_R, startA, endA)
    ctx.closePath()
    ctx.fillStyle = isWinner ? lighten(color, 0.38) : color
    ctx.fill()

    // Divider lines
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth   = 1.8
    ctx.stroke()

    // Winner accent ring
    if (isWinner) {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, WHEEL_R, startA, endA)
      ctx.closePath()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth   = 4
      ctx.stroke()
    }

    // Label
    if (showLabels) {
      const fs = n <= 5 ? 14 : n <= 8 ? 12 : n <= 12 ? 10 : n <= 18 ? 8.5 : 7
      ctx.save()
      ctx.rotate(midA)
      ctx.translate(WHEEL_R * 0.62, 0)
      ctx.font         = `bold ${fs}px DM Sans, sans-serif`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      // Outline for readability over any sector color
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth   = 3
      ctx.strokeText(sectors[i].label, 0, 0)
      ctx.fillStyle   = '#FFFFFF'
      ctx.fillText(sectors[i].label, 0, 0)
      ctx.restore()
    }
  }

  // Rim ring
  ctx.beginPath()
  ctx.arc(0, 0, WHEEL_R, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth   = 6
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(0, 0, RIM_R, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'
  ctx.lineWidth   = 2
  ctx.stroke()

  // Sector boundary pins on rim
  if (n <= 22) {
    for (let i = 0; i < n; i++) {
      const a  = i * sectorAngle
      const px = Math.cos(a) * WHEEL_R
      const py = Math.sin(a) * WHEEL_R
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, 2 * Math.PI)
      ctx.fillStyle   = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth   = 1
      ctx.stroke()
    }
  }

  // Hub (drawn last so it's on top, no rotation correction needed)
  ctx.beginPath()
  ctx.arc(0, 0, HUB_R + 3, 0, 2 * Math.PI)
  ctx.fillStyle = '#1E293B'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, HUB_R, 0, 2 * Math.PI)
  ctx.fillStyle = '#F8FAFC'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, HUB_R - 7, 0, 2 * Math.PI)
  ctx.fillStyle = '#E2E8F0'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, 5, 0, 2 * Math.PI)
  ctx.fillStyle = '#0EA5A0'
  ctx.fill()

  ctx.restore()
}

function drawTicker(ctx: CanvasRenderingContext2D, tickerAngle: number) {
  ctx.save()
  ctx.translate(TICKER_PX, TICKER_PY)
  ctx.rotate(tickerAngle)

  // Body: leaf-spring shape, widest at base, tapers to point
  ctx.beginPath()
  ctx.moveTo(-8, -TICKER_W)
  ctx.bezierCurveTo(
    TICKER_LEN * 0.35, -TICKER_W * 0.9,
    TICKER_LEN * 0.75, -TICKER_W * 0.45,
    TICKER_LEN, 0,
  )
  ctx.bezierCurveTo(
    TICKER_LEN * 0.75,  TICKER_W * 0.45,
    TICKER_LEN * 0.35,  TICKER_W * 0.9,
    -8, TICKER_W,
  )
  ctx.closePath()

  // Shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur    = 5
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 2
  ctx.fillStyle     = '#EF4444'
  ctx.fill()

  // Highlight
  ctx.shadowColor   = 'transparent'
  ctx.beginPath()
  ctx.moveTo(-5, -TICKER_W * 0.45)
  ctx.quadraticCurveTo(TICKER_LEN * 0.55, -TICKER_W * 0.55, TICKER_LEN * 0.88, -TICKER_W * 0.12)
  ctx.strokeStyle = 'rgba(255,255,255,0.38)'
  ctx.lineWidth   = 2.5
  ctx.stroke()

  // Pivot bolt
  ctx.beginPath()
  ctx.arc(0, 0, 10, 0, 2 * Math.PI)
  ctx.fillStyle = '#1E293B'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, 7, 0, 2 * Math.PI)
  ctx.fillStyle = '#94A3B8'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, 2 * Math.PI)
  ctx.fillStyle = '#E2E8F0'
  ctx.fill()

  ctx.restore()
}

// ── Main component ────────────────────────────────────────────────────────────

type Mode = 'sectors' | 'categorical'

export function SpinnerCard() {
  // ── Config state ──────────────────────────────────────────────────────────
  const [mode, setMode]                 = useState<Mode>('sectors')
  const [sectorCount, setSectorCount]   = useState(8)
  const [selectedColId, setSelectedColId] = useState<string>('')
  const [showLabels, setShowLabels]     = useState(true)
  const [spinStrength, setSpinStrength] = useState(1)
  const [recordHistory, setRecordHistory] = useState(true)

  // ── Result state ──────────────────────────────────────────────────────────
  const [isSpinning, setIsSpinning]         = useState(false)
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null)
  const [spinHistory, setSpinHistory]       = useState<Sector[]>([])

  // ── Grid data for categorical mode ────────────────────────────────────────
  const grid = useStore(s => s.grid)
  const catCols = useMemo(
    () => grid.columns.filter(c => c.type === 'categorical'),
    [grid.columns],
  )

  const categoryLabels = useMemo(() => {
    if (!selectedColId) return []
    const values = grid.rows
      .map(r => String(r[selectedColId] ?? ''))
      .filter(v => v !== '' && v !== 'null' && v !== 'undefined' && v !== 'NaN')
    return [...new Set(values)].sort()
  }, [grid, selectedColId])

  // ── Sectors derived from config ───────────────────────────────────────────
  const sectors = useMemo<Sector[]>(() => {
    if (mode === 'categorical') {
      if (categoryLabels.length === 0) return buildNumberedSectors(sectorCount)
      return buildCategorySectors(categoryLabels)
    }
    return buildNumberedSectors(sectorCount)
  }, [mode, sectorCount, categoryLabels])

  // ── Canvas + animation refs ───────────────────────────────────────────────
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const tickAudioPoolRef = useRef<HTMLAudioElement[]>([])
  const tickAudioIndexRef = useRef(0)
  const rafRef          = useRef<number | null>(null)
  const lastTimeRef     = useRef<number | null>(null)
  const wheelAngleRef   = useRef(0)
  const omegaRef        = useRef(0)
  const isSpinningRef   = useRef(false)
  const tickerAngleRef  = useRef(0)
  const tickerOmegaRef  = useRef(0)
  const prevSectorRef   = useRef<number | null>(null)
  const sectorsRef      = useRef(sectors)
  const winnerIdRef     = useRef<string | null>(null)
  const showLabelsRef   = useRef(showLabels)

  useEffect(() => { sectorsRef.current  = sectors },    [sectors])
  useEffect(() => { showLabelsRef.current = showLabels }, [showLabels])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const pool = Array.from({ length: 6 }, () => {
      const audio = new Audio('/sounds/clicksound.mp3')
      audio.preload = 'auto'
      audio.volume = 0.3
      return audio
    })

    tickAudioPoolRef.current = pool
    tickAudioIndexRef.current = 0

    return () => {
      pool.forEach(audio => {
        audio.pause()
        audio.src = ''
      })
      tickAudioPoolRef.current = []
    }
  }, [])

  const playTickSound = useCallback((wheelSpeed: number) => {
    const pool = tickAudioPoolRef.current
    if (pool.length === 0) return

    const audio = pool[tickAudioIndexRef.current % pool.length]
    tickAudioIndexRef.current = (tickAudioIndexRef.current + 1) % pool.length

    audio.pause()
    audio.currentTime = 0
    audio.playbackRate = Math.max(0.9, Math.min(1.35, 0.9 + wheelSpeed / 20))

    void audio.play().catch(() => {
      // Ignore autoplay/playback interruptions; the next user-initiated spin
      // will retry naturally.
    })
  }, [])

  // ── Draw (static, for non-spinning state) ─────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CW, CH)
    drawWheel(ctx, sectorsRef.current, wheelAngleRef.current, winnerIdRef.current, showLabelsRef.current)
    drawTicker(ctx, tickerAngleRef.current)
  }, [])

  // Redraw when sectors or showLabels change while not spinning
  useEffect(() => {
    if (!isSpinning) redraw()
  }, [sectors, showLabels, isSpinning, redraw])

  // ── Animation loop ─────────────────────────────────────────────────────────
  const animate = useCallback((time: DOMHighResTimeStamp) => {
    const dt = lastTimeRef.current === null
      ? 0
      : Math.min((time - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = time

    if (dt > 0) {
      const prevAngle = wheelAngleRef.current
      const n         = sectorsRef.current.length

      // ── Wheel integration ─────────────────────────────────────────────────
      wheelAngleRef.current += omegaRef.current * dt
      omegaRef.current      *= Math.exp(-FRICTION_K * dt)

      // ── Peg / boundary crossing detection ─────────────────────────────────
      // Each time a sector boundary sweeps past the ticker tip:
      //   • The peg knocks the ticker upward (CCW angular impulse)
      //   • The ticker spring pushes back on the peg, braking the wheel
      const prevIdx = getSectorAt(prevAngle, n)
      const currIdx = getSectorAt(wheelAngleRef.current, n)

      if (prevIdx !== currIdx) {
        // Count actual boundaries crossed this frame (usually 1; 2-3 at high n + high speed)
        const nCrossings = Math.min(3, ((prevIdx - currIdx) + n) % n)

        for (let k = 0; k < nCrossings; k++) {
          // Ticker: peg sweeps upward past tip → CCW (negative) angular impulse
          tickerOmegaRef.current -= TICKER_IMPULSE
          playTickSound(Math.abs(omegaRef.current))

          // Wheel: ticker spring reaction brakes the wheel.
          // Capped at 60% of current speed so the wheel never reverses or jerks.
          const brakeAmount = Math.min(WHEEL_BRAKE_IMPULSE, Math.abs(omegaRef.current) * 0.6)
          omegaRef.current  -= Math.sign(omegaRef.current) * brakeAmount
        }
      }

      // ── Ticker spring-damper ───────────────────────────────────────────────
      tickerOmegaRef.current +=
        (-TICKER_SPRING * tickerAngleRef.current - TICKER_DAMPER * tickerOmegaRef.current) * dt
      tickerAngleRef.current += tickerOmegaRef.current * dt

      // Mechanical stop: ticker rests against the wheel rim, can't push past it
      if (tickerAngleRef.current > TICKER_MAX_ANGLE) {
        tickerAngleRef.current = TICKER_MAX_ANGLE
        if (tickerOmegaRef.current > 0) tickerOmegaRef.current = 0
      }

      // ── Continuous ticker → wheel coupling ────────────────────────────────
      // While the ticker is deflected upward it presses against the peg that
      // just passed, providing smooth braking between discrete crossing events.
      // This is what makes low-speed settling feel physical rather than random.
      if (tickerAngleRef.current < 0 && omegaRef.current > 0) {
        const continuousBrake = (-tickerAngleRef.current) * TICKER_WHEEL_COUPLING * dt
        omegaRef.current = Math.max(0, omegaRef.current - continuousBrake)
      }

      // ── Stop condition ─────────────────────────────────────────────────────
      if (isSpinningRef.current && Math.abs(omegaRef.current) < STOP_OMEGA) {
        omegaRef.current      = 0
        isSpinningRef.current = false

        const winIdx = getSectorAt(wheelAngleRef.current, n)
        const winner = sectorsRef.current[winIdx]
        winnerIdRef.current = winner.id
        setIsSpinning(false)
        setSelectedSector(winner)
        setSpinHistory(prev => [...prev, winner])
      }
    }

    // Draw frame
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, CW, CH)
        drawWheel(ctx, sectorsRef.current, wheelAngleRef.current, winnerIdRef.current, showLabelsRef.current)
        drawTicker(ctx, tickerAngleRef.current)
      }
    }

    // Continue if wheel spinning, or if ticker still moving
    if (
      isSpinningRef.current ||
      Math.abs(tickerAngleRef.current) > 0.003 ||
      Math.abs(tickerOmegaRef.current) > 0.01
    ) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      rafRef.current = null
      lastTimeRef.current = null
    }
  }, [playTickSound])

  // ── Spin handler ──────────────────────────────────────────────────────────
  function handleSpin() {
    if (isSpinningRef.current) return
    if (sectors.length < 2) return

    // Clear previous winner
    winnerIdRef.current = null
    setSelectedSector(null)

    // Assign random initial velocity
    const minOmega = 14
    const omega0   = Math.max(minOmega, (20 + Math.random() * 16) * spinStrength)
    omegaRef.current      = omega0
    isSpinningRef.current = true
    lastTimeRef.current   = null
    prevSectorRef.current = null

    setIsSpinning(true)

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(animate)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function handleReset() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    isSpinningRef.current  = false
    omegaRef.current       = 0
    tickerAngleRef.current = 0
    tickerOmegaRef.current = 0
    winnerIdRef.current    = null
    setIsSpinning(false)
    setSelectedSector(null)
    setSpinHistory([])
    setTimeout(redraw, 0)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Initial draw
  useEffect(() => {
    redraw()
  }, [redraw])

  // ── Spin history tallies ──────────────────────────────────────────────────
  const tally = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of spinHistory) {
      map.set(s.fullLabel, (map.get(s.fullLabel) ?? 0) + 1)
    }
    return map
  }, [spinHistory])

  // ── Mode auto-reset when sectors change ───────────────────────────────────
  useEffect(() => {
    winnerIdRef.current = null
    setSelectedSector(null)
    if (!isSpinning) setTimeout(redraw, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors])

  const tooManyCats = mode === 'categorical' && categoryLabels.length > 24
  const totalSpins  = spinHistory.length

  return (
    <div className="flex flex-col xl:flex-row gap-4">

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden inline-block">
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            style={{ display: 'block', cursor: isSpinning ? 'default' : 'pointer' }}
            onClick={() => { if (!isSpinning) handleSpin() }}
            aria-label="Prize wheel — click to spin"
          />
          <div className="border-t border-[var(--color-border)] bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs text-[var(--color-muted)]">
              {isSpinning ? 'Spinning…' : selectedSector ? `Result: ${selectedSector.fullLabel}` : 'Click wheel or Spin button'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Config */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Wheel Setup</div>

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-sm">
            {(['sectors', 'categorical'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {m === 'sectors' ? '# Sectors' : 'Variable'}
              </button>
            ))}
          </div>

          {mode === 'sectors' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--color-text)]">Number of sectors</span>
              <input
                type="number"
                min={2}
                max={24}
                value={sectorCount}
                onChange={e => setSectorCount(Math.max(2, Math.min(24, Number(e.target.value) || 2)))}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
              <span className="text-xs text-[var(--color-muted)]">Equal probability — 2 to 24 sectors</span>
            </label>
          )}

          {mode === 'categorical' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--color-text)]">Categorical variable</span>
              {catCols.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)] rounded-lg border border-[var(--color-border)] px-3 py-2">
                  No categorical columns in current dataset. Load data or switch to # Sectors mode.
                </p>
              ) : (
                <select
                  value={selectedColId}
                  onChange={e => setSelectedColId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm bg-white"
                >
                  <option value="">— select a column —</option>
                  {catCols.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {tooManyCats && (
                <p className="text-xs text-amber-600">
                  {categoryLabels.length} categories — showing all, but labels may be crowded.
                </p>
              )}
              {selectedColId && categoryLabels.length > 0 && (
                <span className="text-xs text-[var(--color-muted)]">
                  {categoryLabels.length} category value{categoryLabels.length !== 1 ? 's' : ''} — equal-size sectors
                </span>
              )}
            </label>
          )}

          {/* Spin strength */}
          <label className="block space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-[var(--color-text)]">Spin strength</span>
              <span className="text-sm text-[var(--color-muted)]">{spinStrength.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={spinStrength}
              onChange={e => setSpinStrength(Number(e.target.value))}
              className="w-full"
            />
          </label>

          {/* Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={e => setShowLabels(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-[var(--color-text)]">Show labels</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recordHistory}
                onChange={e => setRecordHistory(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-[var(--color-text)]">Record results</span>
            </label>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={handleSpin}
            disabled={isSpinning || sectors.length < 2}
            className="flex-1 rounded-xl bg-[var(--color-accent)] py-3 text-base font-bold text-white
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity
                       shadow-sm"
          >
            {isSpinning ? 'Spinning…' : 'Spin'}
          </button>
          <button
            onClick={handleReset}
            disabled={isSpinning}
            className="rounded-xl border border-[var(--color-border)] px-5 py-3 text-sm font-medium
                       text-[var(--color-muted)] hover:bg-slate-50
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Result panel */}
        {selectedSector && !isSpinning && (
          <div className="rounded-2xl border-2 border-[var(--color-accent)] bg-[var(--color-accent-light)] p-5 text-center space-y-1">
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">Result</div>
            <div className="text-3xl font-black text-[var(--color-text)] break-words leading-tight">
              {selectedSector.fullLabel}
            </div>
            {mode === 'sectors' && (
              <div className="text-sm text-[var(--color-muted)]">
                1 in {sectors.length} chance &nbsp;·&nbsp; p = {(1 / sectors.length).toFixed(4)}
              </div>
            )}
          </div>
        )}

        {/* History tally */}
        {recordHistory && totalSpins >= 2 && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Results — {totalSpins} spin{totalSpins !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {sectors.map(s => {
                const count   = tally.get(s.fullLabel) ?? 0
                const pct     = totalSpins > 0 ? count / totalSpins : 0
                const theoPct = 1 / sectors.length
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: WHEEL_COLORS[Number(s.id) % WHEEL_COLORS.length] }}
                    />
                    <span className="flex-1 truncate text-[var(--color-text)]">{s.fullLabel}</span>
                    <span className="font-bold tabular-nums text-[var(--color-text)] w-6 text-right">{count}</span>
                    <span className="text-[var(--color-muted)] w-14 text-right tabular-nums">
                      {(pct * 100).toFixed(1)}%
                    </span>
                    {/* Bar showing empirical vs theoretical */}
                    <div className="w-20 bg-slate-100 rounded-full h-1.5 flex-shrink-0">
                      <div
                        className="h-1.5 rounded-full bg-[var(--color-accent)] transition-all"
                        style={{ width: `${pct * 100}%` }}
                      />
                      <div
                        className="h-0 border-t border-dashed border-slate-400 relative"
                        style={{ marginTop: -6, marginLeft: `${theoPct * 100}%`, width: 0 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {totalSpins >= 5 && (
              <div className="text-[10px] text-[var(--color-muted)] border-t border-[var(--color-border)] pt-2">
                Bar = empirical frequency &nbsp;·&nbsp; Theoretical = {(100 / sectors.length).toFixed(1)}% each
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper used inside animate callback (module-level so it's stable)
function getSectorAt(wheelAngle: number, n: number): number {
  return sectorUnderTicker(wheelAngle, n)
}
