'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Physics / timing constants ────────────────────────────────────────────────

const MAX_VISUAL  = 20    // max simultaneously animated balls
const STAGGER_MS  = 110   // ms between visual ball launches

// Segments (peg-to-peg transitions) per second per speed mode
const SPEED_SEG: Record<Speed, number> = { slow: 2.5, medium: 10, fast: 50 }

// ── Canvas geometry ───────────────────────────────────────────────────────────

const CW         = 480
const CH         = 540
const SIDE_PAD   = 38
const TOP_PAD    = 32
const BIN_AREA_H = 130
const PEG_R      = 4
const BALL_R     = 6
const MAX_ROWS   = 16
const MIN_ROWS   = 4

const BALL_COLORS = [
  '#0EA5A0', '#F59E0B', '#6366F1', '#EF4444',
  '#10B981', '#EC4899', '#F97316', '#8B5CF6',
]

// ── Types ─────────────────────────────────────────────────────────────────────

type Speed = 'slow' | 'medium' | 'fast'

interface BallAnim {
  id:       number
  rows:     number    // board rows this ball was created for
  colAt:    number[]  // colAt[r] = column at peg level r (0-indexed)
  finalBin: number    // = sum of all choices
  segment:  number    // 0 = dropper→peg0 … rows = lastPeg→bin
  progress: number    // 0..1 within current segment
  colorIdx: number
}

interface PendingBall {
  ball:     BallAnim
  launchAt: number    // performance.now() ms when to start animating
}

interface PendingLanding {
  finalBin: number
  landAt: number
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function getLayout(rows: number) {
  const pegSpacing = (CW - 2 * SIDE_PAD) / rows
  const rowHeight  = (CH - TOP_PAD - BIN_AREA_H) / (rows + 0.5)
  return { pegSpacing, rowHeight }
}

function pegXY(level: number, col: number, spacing: number, rowH: number) {
  return {
    x: CW / 2 + (col - level / 2) * spacing,
    y: TOP_PAD + level * rowH,
  }
}

function binCX(bin: number, rows: number, spacing: number) {
  return CW / 2 + (bin - rows / 2) * spacing
}

function binTopY() { return CH - BIN_AREA_H }

function computeColAt(choices: number[]): number[] {
  const out = [0]
  for (const c of choices) out.push(out[out.length - 1] + c)
  return out
}

/** Interpolated ball (x, y) for the current animation segment */
function getBallXY(ball: BallAnim, spacing: number, rowH: number): { x: number; y: number } {
  const { rows: n, segment: s, progress: t, colAt, finalBin } = ball
  let fromX: number, fromY: number, toX: number, toY: number

  if (s === 0) {
    fromX = CW / 2; fromY = 4
    const p = pegXY(0, 0, spacing, rowH)
    toX = p.x; toY = p.y
  } else {
    const fl = s - 1
    const fp = pegXY(fl, colAt[fl], spacing, rowH)
    fromX = fp.x; fromY = fp.y
    if (s === n) {
      toX = binCX(finalBin, n, spacing)
      toY = binTopY()
    } else {
      const tp = pegXY(s, colAt[s], spacing, rowH)
      toX = tp.x; toY = tp.y
    }
  }

  // Parabolic lateral swing (makes deflection visible) + ease-in vertical fall
  const swing  = (toX - fromX) * 0.25 * Math.sin(Math.PI * t)
  const smoothH = t * t * (3 - 2 * t)
  const fallV   = t * t

  return {
    x: fromX + (toX - fromX) * smoothH + swing,
    y: fromY + (toY - fromY) * fallV,
  }
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawBoard(
  ctx:     CanvasRenderingContext2D,
  rows:    number,
  spacing: number,
  rowH:    number,
  balls:   BallAnim[],
  bins:    number[],
  maxBin:  number,
  totalLanded: number,
  showNormalCurve: boolean,
) {
  ctx.clearRect(0, 0, CW, CH)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, CW, CH)

  // Board outline
  ctx.strokeStyle = '#E2E8F0'
  ctx.lineWidth = 1
  ctx.strokeRect(SIDE_PAD - 14, TOP_PAD - 12, CW - 2 * (SIDE_PAD - 14), CH - (TOP_PAD - 12) - 18)

  // ── Bins ────────────────────────────────────────────────────────────────────
  const binTop  = binTopY()
  const binH    = BIN_AREA_H - 22
  const binW    = spacing * 0.70
  const maxBarH = binH - 2
  const fs      = rows > 12 ? 7 : 9

  for (let i = 0; i <= rows; i++) {
    const cx    = binCX(i, rows, spacing)
    const count = bins[i] ?? 0
    const barH  = maxBin > 0 ? (count / maxBin) * maxBarH : 0

    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth   = 1
    ctx.strokeRect(cx - binW / 2, binTop, binW, binH)

    if (barH > 0) {
      const lum = 38 + (1 - count / maxBin) * 22
      ctx.fillStyle = `hsl(177, 68%, ${lum}%)`
      ctx.fillRect(cx - binW / 2 + 1, binTop + binH - barH, binW - 2, barH)
    }

    if (count > 0) {
      ctx.fillStyle    = '#0F1B2D'
      ctx.font         = `bold ${fs}px DM Sans, sans-serif`
      ctx.textAlign    = 'center'
      ctx.fillText(String(count), cx, CH - 5)
    }
  }

  if (showNormalCurve && totalLanded > 0) {
    const mu = rows * 0.5
    const sigma = Math.sqrt(rows * 0.5 * 0.5)
    const peakDensity = sigma > 0 ? 1 / (sigma * Math.sqrt(2 * Math.PI)) : 0

    ctx.beginPath()
    for (let step = 0; step <= 240; step++) {
      const xValue = (rows * step) / 240
      const density = peakDensity > 0
        ? (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xValue - mu) / sigma) ** 2)
        : 0
      const scaledHeight = peakDensity > 0 ? (density / peakDensity) * maxBarH : 0
      const x = binCX(xValue, rows, spacing)
      const y = binTop + binH - scaledHeight
      if (step === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  // ── Pegs ────────────────────────────────────────────────────────────────────
  for (let r = 0; r < rows; r++) {
    for (let j = 0; j <= r; j++) {
      const { x, y } = pegXY(r, j, spacing, rowH)
      // Shadow
      ctx.beginPath()
      ctx.arc(x + 1, y + 1, PEG_R, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fill()
      // Body
      ctx.beginPath()
      ctx.arc(x, y, PEG_R, 0, 2 * Math.PI)
      ctx.fillStyle = '#334155'
      ctx.fill()
      // Highlight
      ctx.beginPath()
      ctx.arc(x - 1, y - 1.2, 1.4, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fill()
    }
  }

  // ── Dropper ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#CBD5E1'
  ctx.fillRect(CW / 2 - 5, 0, 10, TOP_PAD - PEG_R - 4)
  ctx.beginPath()
  ctx.arc(CW / 2, TOP_PAD - PEG_R - 4, 5, 0, 2 * Math.PI)
  ctx.fillStyle = '#94A3B8'
  ctx.fill()

  // ── Balls ─────────────────────────────────────────────────────────────────
  for (const ball of balls) {
    const { x, y } = getBallXY(ball, spacing, rowH)
    const color    = BALL_COLORS[ball.colorIdx % BALL_COLORS.length]
    // Shadow
    ctx.beginPath()
    ctx.arc(x + 1.5, y + 1.5, BALL_R, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fill()
    // Ball
    ctx.beginPath()
    ctx.arc(x, y, BALL_R, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    // Highlight
    ctx.beginPath()
    ctx.arc(x - 2, y - 2, 2.2, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fill()
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GaltonBoard() {
  const [rows,         setRows]         = useState(12)
  const [speed,        setSpeed]        = useState<Speed>('medium')
  const [showNormalCurve, setShowNormalCurve] = useState(false)
  const [isRunning,    setIsRunning]    = useState(false)
  const [totalDropped, setTotalDropped] = useState(0)
  const [totalLanded,  setTotalLanded]  = useState(0)

  // Animation refs — never stale inside RAF
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const rafRef          = useRef<number | null>(null)
  const lastTimeRef     = useRef<number | null>(null)
  const clockRef        = useRef(0)
  const ballsRef        = useRef<BallAnim[]>([])
  const pendingRef      = useRef<PendingBall[]>([])
  const pendingLandingsRef = useRef<PendingLanding[]>([])
  const binsRef         = useRef<number[]>(new Array(13).fill(0))
  const maxBinRef       = useRef(0)
  const totalLandedRef  = useRef(0)
  const totalDroppedRef = useRef(0)
  const rowsRef         = useRef(12)
  const speedRef        = useRef<Speed>('medium')
  const isRunningRef    = useRef(false)
  const ballIdRef       = useRef(0)
  const colorIdxRef     = useRef(0)

  useEffect(() => { rowsRef.current  = rows  }, [rows])
  useEffect(() => { speedRef.current = speed }, [speed])

  const flushState = useCallback(() => {
    setTotalLanded(totalLandedRef.current)
    setTotalDropped(totalDroppedRef.current)
  }, [])

  const redrawStatic = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const n = rowsRef.current
    const { pegSpacing, rowHeight } = getLayout(n)
    drawBoard(
      ctx,
      n,
      pegSpacing,
      rowHeight,
      ballsRef.current,
      binsRef.current,
      maxBinRef.current,
      totalLandedRef.current,
      showNormalCurve,
    )
  }, [showNormalCurve])

  // ── Animation loop ────────────────────────────────────────────────────────
  function animate(time: DOMHighResTimeStamp) {
    const dtMs = lastTimeRef.current === null
      ? 0
      : Math.min(time - lastTimeRef.current, 100)
    const dt = dtMs / 1000
    lastTimeRef.current = time
    clockRef.current += dtMs

    // Launch any pending balls whose time has come
    pendingRef.current = pendingRef.current.filter(p => {
      if (p.launchAt <= clockRef.current) { ballsRef.current.push(p.ball); return false }
      return true
    })

    let anyLanded = false

    pendingLandingsRef.current = pendingLandingsRef.current.filter(p => {
      if (p.landAt <= clockRef.current) {
        binsRef.current[p.finalBin]++
        totalLandedRef.current++
        if (binsRef.current[p.finalBin] > maxBinRef.current) {
          maxBinRef.current = binsRef.current[p.finalBin]
        }
        anyLanded = true
        return false
      }
      return true
    })

    if (dt > 0) {
      const dprogress = SPEED_SEG[speedRef.current] * dt
      const alive: BallAnim[] = []

      for (const sourceBall of ballsRef.current) {
        const ball = { ...sourceBall, progress: sourceBall.progress + dprogress }

        // Advance through segments (handles multi-segment skip at fast speed)
        while (ball.progress >= 1 && ball.segment <= ball.rows) {
          ball.progress -= 1
          ball.segment++
        }

        if (ball.segment > ball.rows) {
          // Landed
          binsRef.current[ball.finalBin]++
          totalLandedRef.current++
          if (binsRef.current[ball.finalBin] > maxBinRef.current) {
            maxBinRef.current = binsRef.current[ball.finalBin]
          }
          anyLanded = true
        } else {
          alive.push(ball)
        }
      }
      ballsRef.current = alive
    }

    // Draw frame
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const n = rowsRef.current
        const { pegSpacing, rowHeight } = getLayout(n)
        drawBoard(
          ctx,
          n,
          pegSpacing,
          rowHeight,
          ballsRef.current,
          binsRef.current,
          maxBinRef.current,
          totalLandedRef.current,
          showNormalCurve,
        )
      }
    }

    if (anyLanded) flushState()

    const hasWork =
      ballsRef.current.length > 0 ||
      pendingRef.current.length > 0 ||
      pendingLandingsRef.current.length > 0
    if (hasWork) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      isRunningRef.current = false
      setIsRunning(false)
      rafRef.current     = null
      lastTimeRef.current = null
      flushState()
    }
  }

  // ── Drop ──────────────────────────────────────────────────────────────────
  function handleDrop(count: number) {
    const n   = rowsRef.current
    const now = clockRef.current
    let visualCount = 0
    const flightMs = ((n + 1) / SPEED_SEG[speedRef.current]) * 1000
    const hiddenStaggerMs = Math.max(4, Math.min(18, 1200 / Math.max(count, 1)))

    for (let i = 0; i < count; i++) {
      const choices: number[] = Array.from({ length: n }, () => (Math.random() < 0.5 ? 0 : 1))
      const finalBin = choices.reduce((s, v) => s + v, 0)
      totalDroppedRef.current++

      if (visualCount < MAX_VISUAL) {
        pendingRef.current.push({
          ball: {
            id:       ballIdRef.current++,
            rows:     n,
            colAt:    computeColAt(choices),
            finalBin,
            segment:  0,
            progress: 0,
            colorIdx: colorIdxRef.current++,
          },
          launchAt: now + visualCount * STAGGER_MS,
        })
        visualCount++
      } else {
        pendingLandingsRef.current.push({
          finalBin,
          landAt: now + flightMs + (i - visualCount) * hiddenStaggerMs,
        })
      }
    }

    flushState()

    if (!isRunningRef.current && pendingRef.current.length > 0) {
      isRunningRef.current = true
      setIsRunning(true)
      lastTimeRef.current = null
      rafRef.current = requestAnimationFrame(animate)
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function handleReset() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    isRunningRef.current    = false
    ballsRef.current        = []
    pendingRef.current      = []
    pendingLandingsRef.current = []
    const n                 = rowsRef.current
    binsRef.current         = new Array(n + 1).fill(0)
    maxBinRef.current       = 0
    totalLandedRef.current  = 0
    totalDroppedRef.current = 0
    lastTimeRef.current     = null
    clockRef.current        = 0
    setIsRunning(false)
    setTotalDropped(0)
    setTotalLanded(0)
    requestAnimationFrame(redrawStatic)
  }

  // Reset bins when rows slider changes (slider disabled while running)
  useEffect(() => {
    binsRef.current         = new Array(rows + 1).fill(0)
    maxBinRef.current       = 0
    totalLandedRef.current  = 0
    totalDroppedRef.current = 0
    clockRef.current        = 0
    pendingLandingsRef.current = []
    requestAnimationFrame(() => {
      setTotalDropped(0)
      setTotalLanded(0)
      redrawStatic()
    })
  }, [rows, redrawStatic])

  useEffect(() => { redrawStatic() }, [redrawStatic])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  const animating = totalDropped > totalLanded

  return (
    <div className="flex flex-col xl:flex-row gap-4">

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden inline-block">
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            style={{ display: 'block' }}
          />
          <div className="border-t border-[var(--color-border)] bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs text-[var(--color-muted)]">
              {totalDropped === 0
                ? 'Drop balls to see the binomial distribution emerge'
                : animating
                  ? `${totalDropped.toLocaleString()} dropped · ${totalLanded.toLocaleString()} landed · animating…`
                  : `${totalDropped.toLocaleString()} balls · ${rows + 1} bins · Bin(${rows}, 0.5)`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Board setup */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Board Setup</div>

          <label className="block space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-[var(--color-text)]">Rows of pegs</span>
              <span className="text-sm tabular-nums text-[var(--color-muted)]">{rows}</span>
            </div>
            <input
              type="range" min={MIN_ROWS} max={MAX_ROWS} step={1}
              value={rows}
              disabled={isRunning}
              onChange={e => setRows(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-[var(--color-muted)]">
              {rows + 1} bins · each ball makes {rows} random left/right choices
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Animation speed</span>
            <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)] text-sm">
              {(['slow', 'medium', 'fast'] as Speed[]).map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`flex-1 py-1.5 font-medium capitalize transition-colors ${
                    speed === s
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-muted)] hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={showNormalCurve}
              onChange={e => setShowNormalCurve(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            <span>Overlay normal curve</span>
          </label>
        </div>

        {/* Drop controls */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Drop Balls</div>
          <div className="grid grid-cols-2 gap-2">
            {([1, 10, 100, 500] as const).map(n => (
              <button key={n}
                onClick={() => handleDrop(n)}
                className="rounded-xl border border-[var(--color-border)] py-2.5 text-sm font-bold
                           text-[var(--color-text)] hover:bg-slate-50 hover:border-[var(--color-accent)]
                           transition-colors"
              >
                {n === 1 ? 'Drop One' : `Drop ${n.toLocaleString()}`}
              </button>
            ))}
          </div>
          <button onClick={handleReset} disabled={isRunning}
            className="w-full rounded-xl border border-[var(--color-border)] py-2.5 text-sm font-medium
                       text-[var(--color-muted)] hover:bg-slate-50 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
