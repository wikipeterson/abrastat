'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { getNumericPairs } from '@/lib/gridHelpers'
import { linearRegression } from '@/lib/statistics'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'
import { RegressionByEyeCardConfig } from '@/lib/exploreTypes'

// ─── Plot geometry ────────────────────────────────────────────────────────────

const M = { top: 20, right: 24, bottom: 46, left: 52 }
const SVG_W = 520
const SVG_H = 360
const PW = SVG_W - M.left - M.right  // plot width
const PH = SVG_H - M.top - M.bottom  // plot height

// ─── Helpers ─────────────────────────────────────────────────────────────────

function niceRange(min: number, max: number, pad = 0.08): [number, number] {
  const span = max - min || 1
  return [min - span * pad, max + span * pad]
}

function niceTicks(min: number, max: number, target = 5): number[] {
  const rawStep = (max - min) / target
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const nice = [1, 2, 2.5, 5, 10].find(f => f * mag >= rawStep) ?? 10
  const step = nice * mag
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let t = start; t <= max + step * 0.01; t += step) {
    ticks.push(parseFloat(t.toPrecision(8)))
    if (ticks.length > 12) break
  }
  return ticks
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return '—'
  if (Math.abs(n) >= 1e5 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(2)
  return parseFloat(n.toPrecision(4)).toString()
}

// ─── Inner interactive plot ───────────────────────────────────────────────────
// Keyed by col IDs so state resets when variables change.

interface PlotProps {
  pairs: [number, number][]
  xName: string
  yName: string
  lsSlope: number
  lsIntercept: number
  plotId: string // for unique SVG clip-path id
}

function RegressionByEyePlot({ pairs, xName, yName, lsSlope, lsIntercept, plotId }: PlotProps) {
  const xs = pairs.map(p => p[0])
  const ys = pairs.map(p => p[1])
  const [xMin, xMax] = niceRange(Math.min(...xs), Math.max(...xs))
  const [yMin, yMax] = niceRange(Math.min(...ys), Math.max(...ys))

  // Default student line: half LS slope, pivoting around data centroid
  const xMid = (xMin + xMax) / 2
  const xSlpHandle = xMin + 0.78 * (xMax - xMin)
  const defaultSlope = lsSlope * 0.5
  const yAtMid = lsSlope * xMid + lsIntercept
  const defaultIntercept = yAtMid - defaultSlope * xMid

  const [slope, setSlope] = useState(defaultSlope)
  const [intercept, setIntercept] = useState(defaultIntercept)
  const [showResiduals, setShowResiduals] = useState(false)
  const [showSSE, setShowSSE] = useState(false)
  const [showSquares, setShowSquares] = useState(false)
  const [showLS, setShowLS] = useState(false)

  // Coordinate transforms
  const toPixX = useCallback((d: number) => M.left + (d - xMin) / (xMax - xMin) * PW, [xMin, xMax])
  const toPixY = useCallback((d: number) => M.top + PH - (d - yMin) / (yMax - yMin) * PH, [yMin, yMax])
  const toDataY = useCallback((py: number) => yMin + (PH - (py - M.top)) / PH * (yMax - yMin), [yMin, yMax])

  const svgRef = useRef<SVGSVGElement>(null)

  function svgPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (SVG_W / r.width),
      y: (e.clientY - r.top) * (SVG_H / r.height),
    }
  }

  const dragRef = useRef<{
    type: 'move' | 'slope'
    capturedSlope: number
    capturedIntercept: number
  } | null>(null)

  function startDrag(e: React.PointerEvent, type: 'move' | 'slope') {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { type, capturedSlope: slope, capturedIntercept: intercept }

    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const { y: py } = svgPoint(ev)
      const newDataY = toDataY(py)

      if (d.type === 'move') {
        // Shift line vertically, keep slope
        setIntercept(newDataY - d.capturedSlope * xMid)
        setSlope(d.capturedSlope)
      } else {
        // Pivot around center-handle position, change slope
        const pivotY = d.capturedSlope * xMid + d.capturedIntercept
        const newSlope = (newDataY - pivotY) / (xSlpHandle - xMid)
        setSlope(newSlope)
        setIntercept(pivotY - newSlope * xMid)
      }
    }

    function onUp() {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Computed residuals
  const predicted = pairs.map(([x]) => slope * x + intercept)
  const residuals = pairs.map(([, y], i) => y - predicted[i])
  const sse = residuals.reduce((s, r) => s + r * r, 0)
  const lsPredicted = pairs.map(([x]) => lsSlope * x + lsIntercept)
  const lsResiduals = pairs.map(([, y], i) => y - lsPredicted[i])
  const lsSSE = lsResiduals.reduce((s, r) => s + r * r, 0)

  // Equation display
  const sign = intercept >= 0 ? '+' : '−'
  const equation = `ŷ = ${fmtNum(slope)}x ${sign} ${fmtNum(Math.abs(intercept))}`
  const lsSign = lsIntercept >= 0 ? '+' : '−'
  const lsEquation = `ŷ = ${fmtNum(lsSlope)}x ${lsSign} ${fmtNum(Math.abs(lsIntercept))}`

  // Line endpoints (full plot width)
  const lineX1 = toPixX(xMin), lineY1 = toPixY(slope * xMin + intercept)
  const lineX2 = toPixX(xMax), lineY2 = toPixY(slope * xMax + intercept)
  const lsY1 = toPixY(lsSlope * xMin + lsIntercept)
  const lsY2 = toPixY(lsSlope * xMax + lsIntercept)

  // Handle pixel positions (clamped so they stay inside plot area)
  const clampY = (py: number) => Math.max(M.top + 11, Math.min(M.top + PH - 11, py))
  const movePx = { x: toPixX(xMid), y: clampY(toPixY(slope * xMid + intercept)) }
  const slpPx  = { x: toPixX(xSlpHandle), y: clampY(toPixY(slope * xSlpHandle + intercept)) }

  const xTicks = niceTicks(xMin, xMax)
  const yTicks = niceTicks(yMin, yMax)
  const clipId = `rbe-clip-${plotId}`

  function reset() {
    setSlope(defaultSlope)
    setIntercept(defaultIntercept)
  }

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Equation / SSE bar */}
      <div className="bg-[var(--color-accent-light)] rounded-xl px-4 py-2 flex items-start justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-0.5">Your line</div>
            <div className="font-mono text-sm font-semibold text-[var(--color-text)]">{equation}</div>
            {showSSE && (
              <div className="text-[11px] text-[var(--color-muted)] mt-0.5">SSE: <span className="font-mono font-semibold text-[var(--color-text)]">{fmtNum(sse)}</span></div>
            )}
          </div>
          {showLS && (
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[#10B981] mb-0.5">Least-squares</div>
              <div className="font-mono text-sm font-semibold text-[#047857]">{lsEquation}</div>
              <div className="text-[11px] text-[#047857] mt-0.5">SSE: <span className="font-mono font-semibold">{fmtNum(lsSSE)}</span></div>
            </div>
          )}
        </div>
      </div>

      {/* SVG scatterplot */}
      <div className="flex-1 min-h-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          style={{ userSelect: 'none', touchAction: 'none' }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={M.left} y={M.top} width={PW} height={PH} />
            </clipPath>
          </defs>

          {/* Plot background */}
          <rect x={M.left} y={M.top} width={PW} height={PH} fill="white" stroke="#E2E8F0" strokeWidth={1} />

          {/* Grid */}
          {xTicks.map(t => (
            <line key={`xg${t}`} x1={toPixX(t)} y1={M.top} x2={toPixX(t)} y2={M.top + PH}
              stroke="#E2E8F0" strokeWidth={1} />
          ))}
          {yTicks.map(t => (
            <line key={`yg${t}`} x1={M.left} y1={toPixY(t)} x2={M.left + PW} y2={toPixY(t)}
              stroke="#E2E8F0" strokeWidth={1} />
          ))}

          {/* Axes */}
          <line x1={M.left} y1={M.top + PH} x2={M.left + PW} y2={M.top + PH} stroke="#CBD5E1" strokeWidth={1.5} />
          <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + PH} stroke="#CBD5E1" strokeWidth={1.5} />

          {/* Tick labels */}
          {xTicks.map(t => (
            <text key={`xl${t}`} x={toPixX(t)} y={M.top + PH + 15} textAnchor="middle" fontSize={10} fill="#64748B">
              {fmtNum(t)}
            </text>
          ))}
          {yTicks.map(t => (
            <text key={`yl${t}`} x={M.left - 6} y={toPixY(t) + 3.5} textAnchor="end" fontSize={10} fill="#64748B">
              {fmtNum(t)}
            </text>
          ))}

          {/* Axis labels */}
          <text x={M.left + PW / 2} y={SVG_H - 4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#0F1B2D">
            {xName}
          </text>
          <text
            transform={`rotate(-90)`}
            x={-(M.top + PH / 2)}
            y={14}
            textAnchor="middle"
            fontSize={11}
            fontWeight={500}
            fill="#0F1B2D"
          >
            {yName}
          </text>

          {/* Clipped layer: lines + diagnostics */}
          <g clipPath={`url(#${clipId})`}>
            {/* Residual squares */}
            {showSquares && pairs.map(([px, py], i) => {
              const pixX = toPixX(px)
              const pixY = toPixY(py)
              const predPixY = toPixY(predicted[i])
              const sideH = Math.abs(pixY - predPixY)
              const rectTop = Math.min(pixY, predPixY)
              return (
                <rect
                  key={`sq${i}`}
                  x={pixX}
                  y={rectTop}
                  width={sideH}
                  height={sideH}
                  fill="#F59E0B"
                  fillOpacity={0.18}
                  stroke="#F59E0B"
                  strokeWidth={1}
                  strokeOpacity={0.55}
                />
              )
            })}

            {/* Residual segments */}
            {showResiduals && pairs.map(([px, py], i) => (
              <line
                key={`res${i}`}
                x1={toPixX(px)} y1={toPixY(py)}
                x2={toPixX(px)} y2={toPixY(predicted[i])}
                stroke="#EF4444"
                strokeWidth={1.5}
                strokeDasharray="3,2"
              />
            ))}

            {/* Least-squares line */}
            {showLS && (
              <line
                x1={lineX1} y1={lsY1} x2={lineX2} y2={lsY2}
                stroke="#10B981"
                strokeWidth={2}
                strokeDasharray="7,4"
              />
            )}

            {/* Student line */}
            <line
              x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2}
              stroke="#0EA5A0"
              strokeWidth={2.5}
            />
          </g>

          {/* Data points (above clip so they don't get clipped) */}
          {pairs.map(([px, py], i) => (
            <circle
              key={`pt${i}`}
              cx={toPixX(px)}
              cy={toPixY(py)}
              r={4}
              fill="#0F1B2D"
              fillOpacity={0.65}
              stroke="white"
              strokeWidth={1}
            />
          ))}

          {/* LS line legend label */}
          {showLS && (
            <text x={M.left + PW - 4} y={lsY2 - 5} textAnchor="end" fontSize={9} fill="#10B981" fontWeight={600}>
              least-squares
            </text>
          )}

          {/* Move handle (teal circle, shifts line up/down) */}
          <circle
            cx={movePx.x}
            cy={movePx.y}
            r={11}
            fill="white"
            stroke="#0EA5A0"
            strokeWidth={2.5}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={e => startDrag(e, 'move')}
          />
          <text
            x={movePx.x} y={movePx.y + 4}
            textAnchor="middle"
            fontSize={11}
            fill="#0EA5A0"
            fontWeight={700}
            style={{ pointerEvents: 'none' }}
          >
            ↕
          </text>

          {/* Slope handle (indigo circle, changes tilt) */}
          <circle
            cx={slpPx.x}
            cy={slpPx.y}
            r={11}
            fill="white"
            stroke="#6366F1"
            strokeWidth={2.5}
            style={{ cursor: 'ns-resize' }}
            onPointerDown={e => startDrag(e, 'slope')}
          />
          <text
            x={slpPx.x} y={slpPx.y + 4}
            textAnchor="middle"
            fontSize={10}
            fill="#6366F1"
            fontWeight={700}
            style={{ pointerEvents: 'none' }}
          >
            ↻
          </text>
        </svg>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 shrink-0">
        {([
          ['Residuals',          showResiduals,  setShowResiduals],
          ['SSE',                showSSE,        setShowSSE],
          ['Residual squares',   showSquares,    setShowSquares],
          ['Least-squares line', showLS,         setShowLS],
        ] as [string, boolean, (v: boolean) => void][]).map(([label, val, setter]) => (
          <label key={label} className="flex items-center gap-1.5 cursor-pointer text-xs text-[var(--color-muted)] select-none">
            <input
              type="checkbox"
              checked={val}
              onChange={e => setter(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            {label}
          </label>
        ))}
        <button
          onClick={reset}
          className="ml-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] border border-[var(--color-border)] rounded px-2.5 py-0.5 transition-colors"
        >
          Reset line
        </button>
      </div>

      {/* Handle legend */}
      <div className="flex items-center gap-4 px-1 pb-0.5 shrink-0">
        <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[#0EA5A0]" />
          drag to shift
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[#6366F1]" />
          drag to tilt
        </span>
        {showLS && (
          <span className="flex items-center gap-1 text-[10px] text-[#10B981]">
            <svg width="18" height="6" viewBox="0 0 18 6" className="inline-block">
              <line x1="0" y1="3" x2="18" y2="3" stroke="#10B981" strokeWidth="2" strokeDasharray="5,3" />
            </svg>
            least-squares
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Card shell ───────────────────────────────────────────────────────────────

interface RegressionByEyeCardProps {
  cardId: string
  config: RegressionByEyeCardConfig
  onClearZone: (zone: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

export function RegressionByEyeCard({ cardId, config, onClearZone, onRemove, hideHeader }: RegressionByEyeCardProps) {
  const { grid } = useStore()

  const xCol = config.xColId ? grid.columns.find(c => c.id === config.xColId) ?? null : null
  const yCol = config.yColId ? grid.columns.find(c => c.id === config.yColId) ?? null : null

  const pairs = useMemo(() => {
    if (!config.xColId || !config.yColId) return []
    return getNumericPairs(grid, config.xColId, config.yColId)
  }, [grid, config.xColId, config.yColId])

  const lsReg = useMemo(() => {
    if (pairs.length < 2) return null
    return linearRegression(pairs.map(p => p[0]), pairs.map(p => p[1]))
  }, [pairs])

  function handleNativeDrop(zone: 'x' | 'y') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      const droppedCol = grid.columns.find(c => c.id === colId)
      if (!droppedCol || droppedCol.type !== 'numeric') return
      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
      if (!current || current.config.type !== 'regression-by-eye') return
      useStore.getState().updateExploreCard(cardId, {
        config: { ...current.config, [zone === 'x' ? 'xColId' : 'yColId']: colId },
      })
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const content = (() => {
    if (!xCol || !yCol) {
      return (
        <EmptyState
          icon="📏"
          title="Drop two numeric variables"
          description="Choose an X variable and a Y variable, then drag the handles to fit a line."
        />
      )
    }
    if (xCol.type !== 'numeric' || yCol.type !== 'numeric') {
      return (
        <EmptyState
          icon="📏"
          title="Numeric variables only"
          description="Both X and Y must be numeric columns."
        />
      )
    }
    if (!lsReg || pairs.length < 3) {
      return (
        <EmptyState
          icon="📏"
          title="Not enough data"
          description="Need at least 3 rows with valid numeric values in both variables."
        />
      )
    }
    return (
      <RegressionByEyePlot
        key={`${config.xColId}:${config.yColId}`}
        pairs={pairs}
        xName={xCol.name}
        yName={yCol.name}
        lsSlope={lsReg.slope}
        lsIntercept={lsReg.intercept}
        plotId={cardId}
      />
    )
  })()

  const inner = (
    <div className="h-full flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('x')}>
          <DropZone
            id={`${cardId}:x`}
            label="X Variable"
            hint="numeric variable"
            assignedCol={xCol}
            onClear={() => onClearZone('x')}
          />
        </div>
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('y')}>
          <DropZone
            id={`${cardId}:y`}
            label="Y Variable"
            hint="numeric variable"
            assignedCol={yCol}
            onClear={() => onClearZone('y')}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {content}
      </div>
    </div>
  )

  if (hideHeader) return inner

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Regression by Eye</span>
        <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
      </div>
      <div className="p-4 min-h-[520px]">
        {inner}
      </div>
    </div>
  )
}
