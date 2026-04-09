'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { OnePropRandomizationCardConfig, OnePropSimCardConfig } from '@/lib/exploreTypes'
import {
  Alternative,
  OnePropResult,
  isExtremeOneProp,
  runOnePropRandomization,
} from '@/lib/randomizationTest'

// ── Layout helpers ────────────────────────────────────────────────────────────

const CANVAS_W  = 640
const HEADER_H  = 24
const CARD_TOP_Y = 8
const COL_W     = 240

const COL_CX = {
  left:  CANVAS_W * 0.28,
  right: CANVAS_W * 0.72,
}

interface CardLayout { w: number; h: number; stepX: number; stepY: number; perRow: number }

function getCardLayout(n: number): CardLayout {
  const w = n <= 20 ? 36 : n <= 40 ? 26 : n <= 80 ? 18 : n <= 160 ? 13 : n <= 300 ? 10 : 8
  const h = Math.ceil(w * 1.55)
  const gap = 2
  return { w, h, stepX: w + gap, stepY: h + gap, perRow: Math.max(1, Math.floor(COL_W / (w + gap))) }
}

function getSlotXY(idx: number, colCx: number, layout: CardLayout, groupSize: number) {
  const cols = Math.min(layout.perRow, groupSize)
  return {
    x: colCx - (cols * layout.stepX) / 2 + (idx % cols) * layout.stepX,
    y: CARD_TOP_Y + Math.floor(idx / cols) * layout.stepY,
  }
}

function getCanvasHeight(n: number): number {
  const layout = getCardLayout(n)
  const cols = Math.min(layout.perRow, n)
  const rows = Math.ceil(n / cols)
  return Math.max(110, Math.min(CARD_TOP_Y + rows * layout.stepY + 30, 200))
}

// ── Null distribution plot ────────────────────────────────────────────────────

type GraphView = 'proportions' | 'counts'

function formatTick(v: number, range: number): string {
  if (range >= 100) return v.toFixed(0)
  if (range >= 10)  return v.toFixed(1)
  if (range >= 1)   return v.toFixed(2)
  return v.toFixed(3)
}

function OnePropNullDistPlot({
  counts, xObs, n, p0Num, alternative, view, showNormalCurve = false,
}: {
  counts: number[]
  xObs: number
  n: number
  p0Num: number
  alternative: Alternative
  view: GraphView
  showNormalCurve?: boolean
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 30, l: 16 }
  const plotHeight = 150
  const SVG_H = plotHeight + MG.t + MG.b
  const PW = SVG_W - MG.l - MG.r
  const PH = SVG_H - MG.t - MG.b

  // Convert counts → display values
  const values = view === 'counts' ? counts : counts.map(c => c / n)
  const obsVal    = view === 'counts' ? xObs : xObs / n
  const nullCenter = view === 'counts' ? n * p0Num : p0Num
  const normSD    = view === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  // Dynamic x-axis range
  const padSD = Math.max(normSD * 3.5, Math.abs(obsVal - nullCenter) * 1.3, (view === 'counts' ? 1 : 1 / n))
  const rawMin = Math.min(...(values.length > 0 ? values : [obsVal]), nullCenter - padSD)
  const rawMax = Math.max(...(values.length > 0 ? values : [obsVal]), nullCenter + padSD)
  const rawRange = rawMax - rawMin || 1
  const pad = rawRange * 0.08
  const xLo = rawMin - pad
  const xHi = rawMax + pad
  const xRange = xHi - xLo
  const xOf = (v: number) => ((v - xLo) / xRange) * PW

  // Bucket for dot stacking
  const normalizedValues = values.map(v => Number(v.toFixed(6)))
  const uniqueVals = Array.from(new Set(normalizedValues)).sort((a, b) => a - b)
  const inferredStep = uniqueVals.length < 2
    ? xRange * 0.05
    : uniqueVals.slice(1).reduce((minGap, val, idx) => {
        const gap = val - uniqueVals[idx]
        return gap > 0 ? Math.min(minGap, gap) : minGap
      }, Infinity)
  const bucket = Number.isFinite(inferredStep) && inferredStep > 0 ? inferredStep : xRange * 0.05

  const stackCounts = new Map<number, number>()
  normalizedValues.forEach(v => stackCounts.set(v, (stackCounts.get(v) ?? 0) + 1))
  const maxStack = Math.max(1, ...Array.from(stackCounts.values()))

  // Normal overlay
  const normalStats = (() => {
    if (!showNormalCurve || values.length < 2 || normSD <= 0) return null
    const samples = Array.from({ length: 241 }, (_, i) => {
      const x = xLo + (i / 240) * xRange
      const z = (x - nullCenter) / normSD
      const pdf = Math.exp(-0.5 * z * z) / (normSD * Math.sqrt(2 * Math.PI))
      return { x, expectedCount: values.length * pdf * bucket }
    })
    return { samples }
  })()

  const maxCurveCountRaw = normalStats ? Math.max(...normalStats.samples.map(s => s.expectedCount)) : 0
  const maxCurveCount = Math.min(maxCurveCountRaw, Math.max(maxStack * 1.35, 1))
  const topPad = 10
  const yMaxCount = Math.max(maxStack, maxCurveCount) * 1.12
  const yScale = (PH - topPad) / Math.max(1, yMaxCount)

  const seenC = new Map<number, number>()
  const dotStep = Math.min(6, yScale)
  const dotR = Math.max(0.55, Math.min(2.6, dotStep / 2 - 0.15))
  const circles = normalizedValues.map(v => {
    const si = seenC.get(v) ?? 0
    seenC.set(v, si + 1)
    // Recover count from proportion for extremeness check
    const xSimVal = view === 'counts' ? v : Math.round(v * n)
    const extreme = isExtremeOneProp(xSimVal, xObs, n, p0Num, alternative)
    return { cx: xOf(v), cy: PH - (si + 1) * dotStep + dotStep / 2, extreme }
  })

  const normalPath = normalStats
    ? normalStats.samples
        .map(s => `${xOf(s.x)},${Math.min(PH, Math.max(0, PH - s.expectedCount * yScale))}`)
        .join(' ')
    : ''

  const obsX = xOf(obsVal)

  // Shade extreme region
  let shade = ''
  if (alternative === 'greater') {
    shade = `M${obsX},0 H${PW} V${PH} H${obsX} Z`
  } else if (alternative === 'less') {
    shade = `M0,0 H${obsX} V${PH} H0 Z`
  } else {
    const dist = Math.abs(obsVal - nullCenter)
    const xL = Math.max(0, xOf(nullCenter - dist))
    const xR = Math.min(PW, xOf(nullCenter + dist))
    shade = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z`
  }

  const ticks = Array.from({ length: 5 }, (_, i) => xLo + (i / 4) * xRange)

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop{from{transform:translateY(-28px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH} /></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shade} fill="#0EA5A0" opacity={0.10} />
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5} />
        {ticks.map((v, i) => (
          <g key={i} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="#CBD5E1" strokeWidth={1} />
            <text y={12} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="DM Sans,sans-serif">
              {formatTick(v, xRange)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circles.map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR}
              fill={c.extreme ? '#0EA5A0' : '#94A3B8'} opacity={0.85}
              style={i === circles.length - 1 && values.length > 0
                ? { animation: 'dot-drop 250ms ease-out' } : undefined}
            />
          ))}
          {normalPath && (
            <polyline points={normalPath} fill="none" stroke="#F59E0B" strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          )}
        </g>
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3" />
        <text x={obsX + (obsVal >= nullCenter ? 3 : -3)} y={5}
          textAnchor={obsVal >= nullCenter ? 'start' : 'end'}
          fontSize={8} fill="#EF4444" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        <text x={PW / 2} y={PH + 24} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans,sans-serif">
          {view === 'counts' ? 'Simulated X (count of successes)' : 'Simulated p̂'}
        </text>
      </g>
    </svg>
  )
}

// ── Config card ───────────────────────────────────────────────────────────────

type SourceMode = 'data' | 'manual'
interface ConfigProps { cardId: string; config: OnePropRandomizationCardConfig; onClearZone: (z: string) => void }

export function OnePropRandomizationTest({ cardId, config, onClearZone }: ConfigProps) {
  const { grid, updateExploreCard, addOnePropSimCard, exploreCards } = useStore()

  const [sourceMode, setSourceMode]     = useState<SourceMode>('data')
  const [successLevel, setSuccessLevel] = useState('')
  const [manualX, setManualX]           = useState('')
  const [manualN, setManualN]           = useState('')
  const [manualLabel, setManualLabel]   = useState('Success')
  const [nullP, setNullP]               = useState('0.5')
  const [alternative, setAlternative]   = useState<Alternative>('two')

  const catCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null

  function handleNativeDrop(e: React.DragEvent) {
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    e.preventDefault()
    const droppedCol = useStore.getState().grid.columns.find(c => c.id === colId)
    if (!droppedCol || droppedCol.type !== 'categorical') return
    const current = useStore.getState().exploreCards.find(c => c.id === cardId)
    if (!current || current.config.type !== 'one-prop-randomization') return
    updateExploreCard(cardId, { config: { ...current.config, var1ColId: colId } })
  }
  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }

  const catLevels = useMemo(() =>
    config.var1ColId
      ? [...new Set(grid.rows.map(r => String(r[config.var1ColId!] ?? '').trim()).filter(Boolean))].sort()
      : [],
    [grid.rows, config.var1ColId])

  useEffect(() => {
    if (catLevels.length > 0)
      setSuccessLevel(l => (l && catLevels.includes(l)) ? l : catLevels[0])
  }, [catLevels])

  // Compute n, x, p̂
  const computed = useMemo(() => {
    if (sourceMode === 'manual') {
      const xVal = parseInt(manualX, 10)
      const nVal = parseInt(manualN, 10)
      if (!Number.isFinite(xVal) || !Number.isFinite(nVal)) return { n: 0, x: 0, phat: null, error: 'Enter x and n' as string | null }
      if (nVal <= 0)           return { n: 0, x: 0, phat: null, error: 'n must be > 0' as string | null }
      if (xVal < 0 || xVal > nVal) return { n: 0, x: 0, phat: null, error: '0 ≤ x ≤ n required' as string | null }
      return { n: nVal, x: xVal, phat: xVal / nVal, error: null as string | null }
    }
    if (!config.var1ColId || !successLevel)
      return { n: 0, x: 0, phat: null, error: 'Assign a variable' as string | null }
    let nCount = 0, xCount = 0
    for (const row of grid.rows) {
      const val = String(row[config.var1ColId] ?? '').trim()
      if (!val) continue
      nCount++
      if (val === successLevel) xCount++
    }
    if (nCount === 0) return { n: 0, x: 0, phat: null, error: 'No valid rows' as string | null }
    return { n: nCount, x: xCount, phat: xCount / nCount, error: null as string | null }
  }, [sourceMode, manualX, manualN, config.var1ColId, successLevel, grid.rows])

  const { n, x, phat, error } = computed
  const p0Num   = parseFloat(nullP)
  const p0Valid = Number.isFinite(p0Num) && p0Num >= 0 && p0Num <= 1
  const canLaunch = error === null && n > 0 && p0Valid

  const altSymbol    = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement = `p ${altSymbol} ${nullP}`

  function handleLaunch() {
    if (!canLaunch) return
    const myCard = exploreCards.find(c => c.id === cardId)
    if (!myCard) return
    const successLabel = sourceMode === 'manual'
      ? (manualLabel.trim() || 'Success')
      : successLevel
    addOnePropSimCard({
      n, x,
      successLabel,
      failureLabel: `Not ${successLabel}`,
      nullP,
      alternative,
    }, myCard)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">
        {/* Source mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Source</span>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {(['data', 'manual'] as SourceMode[]).map((m, i) => (
              <button key={m} onClick={() => setSourceMode(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${sourceMode === m ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}>
                {m === 'data' ? 'Use Data' : 'Enter Info'}
              </button>
            ))}
          </div>
        </div>

        {/* Data / manual inputs */}
        {sourceMode === 'data' ? (
          <div className="space-y-3">
            <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop}>
              <DropZone
                id={`${cardId}:var1`}
                label="Categorical Variable"
                hint="categorical only"
                assignedCol={catCol}
                onClear={() => onClearZone('var1')}
              />
            </div>
            {catLevels.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
                <select value={successLevel} onChange={e => setSuccessLevel(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                  {catLevels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {phat !== null && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-2 text-center text-sm">
                <span className="text-[var(--color-muted)]">p̂ = {x}/{n} = </span>
                <span className="font-bold text-[var(--color-accent)]">{phat.toFixed(4)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-around py-1">
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-bold text-[var(--color-text)]">
                  p̂ <span className="text-xs text-[var(--color-muted)] font-normal">= x / n</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col items-end gap-1 text-xs font-mono text-[var(--color-muted)]" style={{ paddingBottom: 2 }}>
                    <span className="py-1.5">x</span>
                    <span className="py-1.5">n</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input type="number" min={0} step={1} value={manualX} onChange={e => setManualX(e.target.value)}
                      placeholder=" "
                      className="w-20 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
                    <div className="my-0.5 w-[5rem] border-t-2 border-[var(--color-text)]" />
                    <input type="number" min={1} step={1} value={manualN} onChange={e => setManualN(e.target.value)}
                      placeholder=" "
                      className="w-20 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
                  </div>
                </div>
                <div className="text-sm text-[var(--color-muted)]">
                  = <span className="font-bold text-[var(--color-text)]">{phat !== null ? phat.toFixed(3) : '—'}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Success label (optional)</label>
              <input value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Success"
                className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-white text-[var(--color-text)]" />
            </div>
          </div>
        )}

        {/* Hypothesis */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₀: p =</span>
            <input type="number" min={0} max={1} step={0.01} value={nullP} onChange={e => setNullP(e.target.value)}
              className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₁</span>
            <select value={alternative} onChange={e => setAlternative(e.target.value as Alternative)}
              className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
              <option value="less">&lt;</option>
              <option value="greater">&gt;</option>
              <option value="two">≠</option>
            </select>
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">{altStatement}</span>
          </div>
          <button onClick={handleLaunch} disabled={!canLaunch}
            className="ml-auto rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            Launch Simulation →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Simulation card ───────────────────────────────────────────────────────────

export function OnePropSimCard({ cardId, config }: { cardId: string; config: OnePropSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const [lastSim, setLastSim]     = useState<OnePropResult | null>(null)
  const [flash, setFlash]         = useState(false)
  const [graphView, setGraphView] = useState<GraphView>('proportions')

  const { n, x } = config
  const phat        = n > 0 ? x / n : 0
  const p0Num       = parseFloat(config.nullP)
  const nullDist    = config.nullDist
  const simCount    = config.simCount
  const extremeCount = config.extremeCount
  const alternative  = config.alternative
  const showNormalCurve = config.showNormalCurve ?? false

  const pValue = simCount > 0 ? extremeCount / simCount : null

  // Normal overlay stats (theoretical, not empirical)
  const normMean = graphView === 'counts' ? n * p0Num : p0Num
  const normSD   = graphView === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  const altSymbol    = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement = `p ${altSymbol} ${config.nullP}`

  const layout  = getCardLayout(n)
  const canvasH = getCanvasHeight(n)

  // Chip arrays
  const obsChips = useMemo(() => {
    const chips: { idx: number; success: boolean }[] = []
    for (let i = 0; i < x; i++) chips.push({ idx: i, success: true })
    for (let i = x; i < n; i++) chips.push({ idx: i, success: false })
    return chips
  }, [n, x])

  const simChips = useMemo(() => {
    if (!lastSim) return null
    const chips: { idx: number; success: boolean }[] = []
    for (let i = 0; i < lastSim.xSim; i++) chips.push({ idx: i, success: true })
    for (let i = lastSim.xSim; i < n; i++) chips.push({ idx: i, success: false })
    return chips
  }, [lastSim, n])

  function runBatch(count: number) {
    if (!Number.isFinite(p0Num) || p0Num < 0 || p0Num > 1) return
    let newExtreme = 0
    let last: OnePropResult | null = null
    const newCounts: number[] = []
    for (let i = 0; i < count; i++) {
      const r = runOnePropRandomization(n, p0Num)
      last = r
      newCounts.push(r.xSim)
      if (isExtremeOneProp(r.xSim, x, n, p0Num, alternative)) newExtreme++
    }
    if (last) {
      const captured = last
      setFlash(true)
      setTimeout(() => { setFlash(false); setLastSim(captured) }, 80)
    }
    updateExploreCard(cardId, {
      config: {
        ...config,
        nullDist: [...nullDist, ...newCounts],
        simCount: simCount + count,
        extremeCount: extremeCount + newExtreme,
      }
    })
  }

  function handleReset() {
    setLastSim(null)
    setFlash(false)
    updateExploreCard(cardId, {
      config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 }
    })
  }

  const lastSimExtreme = lastSim
    ? isExtremeOneProp(lastSim.xSim, x, n, p0Num, alternative)
    : false

  const chipBorderW = Math.max(1, Math.floor(layout.w / 14))
  const chipRadius  = Math.max(2, Math.floor(layout.w / 7))

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[660px_minmax(300px,1fr)]">

          {/* ── Chip visual ── */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="overflow-x-auto flex justify-center">
              <div className="w-fit">
                {/* Column headers */}
                <div className="relative bg-slate-50 border-b border-[var(--color-border)]"
                  style={{ width: CANVAS_W, height: HEADER_H }}>
                  <span style={{
                    position: 'absolute', left: COL_CX.left, top: '50%',
                    transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 600, color: 'var(--color-text)'
                  }}>Observed</span>
                  <span style={{
                    position: 'absolute', left: COL_CX.right, top: '50%',
                    transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 600, color: 'var(--color-text)'
                  }}>Simulated (null)</span>
                </div>

                {/* Chip area */}
                <div className="relative bg-white" style={{ width: CANVAS_W, height: canvasH }}>
                  {/* Lane backgrounds */}
                  {[COL_CX.left, COL_CX.right].map((cx, i) => (
                    <div key={i} className="absolute inset-y-0" style={{
                      left: cx - COL_W / 2 - 4, width: COL_W + 8,
                      background: 'rgba(14,165,160,0.04)',
                      borderRight: i === 0 ? '1px dashed rgba(14,165,160,0.2)' : 'none',
                      borderLeft:  i === 1 ? '1px dashed rgba(14,165,160,0.2)' : 'none',
                    }} />
                  ))}

                  {/* Observed chips */}
                  {obsChips.map(chip => {
                    const { x: cx, y: cy } = getSlotXY(chip.idx, COL_CX.left, layout, n)
                    return (
                      <div key={`obs-${chip.idx}`} style={{
                        position: 'absolute', left: cx, top: cy,
                        width: layout.w, height: layout.h,
                        borderRadius: chipRadius,
                        backgroundColor: chip.success ? '#2EC4B6' : '#E2E8F0',
                        border: `${chipBorderW}px solid ${chip.success ? '#1A8C80' : '#CBD5E1'}`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
                        boxSizing: 'border-box',
                      }} />
                    )
                  })}

                  {/* Simulated chips */}
                  {simChips ? simChips.map(chip => {
                    const { x: cx, y: cy } = getSlotXY(chip.idx, COL_CX.right, layout, n)
                    const bg  = flash ? '#94A3B8' : (chip.success ? '#2EC4B6' : '#E2E8F0')
                    const bdr = flash ? '#CBD5E1' : (chip.success ? '#1A8C80' : '#CBD5E1')
                    return (
                      <div key={`sim-${chip.idx}`} style={{
                        position: 'absolute', left: cx, top: cy,
                        width: layout.w, height: layout.h,
                        borderRadius: chipRadius,
                        backgroundColor: bg,
                        border: `${chipBorderW}px solid ${bdr}`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
                        boxSizing: 'border-box',
                        transition: 'background-color 120ms, border-color 120ms',
                      }} />
                    )
                  }) : (
                    <div style={{
                      position: 'absolute',
                      left: COL_CX.right - 52,
                      top: canvasH / 2 - 9,
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      opacity: 0.5,
                    }}>
                      Run a simulation
                    </div>
                  )}
                </div>

                {/* Per-column stats */}
                <div className="border-t border-[var(--color-border)] bg-slate-50 px-3 py-1.5"
                  style={{ width: CANVAS_W }}>
                  <div className="flex items-center">
                    <div style={{ flex: 1, textAlign: 'center' }} className="text-xs text-[var(--color-text)]">
                      <span className="text-[var(--color-muted)]">X = </span>
                      <span className="font-bold">{x}</span>
                      <span className="mx-1.5 text-[var(--color-border)]">·</span>
                      <span className="text-[var(--color-muted)]">p̂ = </span>
                      <span className="font-bold">{phat.toFixed(3)}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }} className="text-xs text-[var(--color-text)]">
                      {lastSim ? (
                        <>
                          <span className="text-[var(--color-muted)]">X = </span>
                          <span className={`font-bold ${lastSimExtreme ? 'text-[var(--color-accent)]' : ''}`}>
                            {lastSim.xSim}
                          </span>
                          {lastSimExtreme && <span className="text-[10px] text-[var(--color-accent)] ml-0.5">★</span>}
                          <span className="mx-1.5 text-[var(--color-border)]">·</span>
                          <span className="text-[var(--color-muted)]">p̂ = </span>
                          <span className={`font-bold ${lastSimExtreme ? 'text-[var(--color-accent)]' : ''}`}>
                            {lastSim.pSim.toFixed(3)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--color-muted)] opacity-40">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="border-t border-[var(--color-border)] bg-slate-50 px-3 py-1 flex gap-4"
                  style={{ width: CANVAS_W }}>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="inline-block rounded-sm bg-[#2EC4B6] flex-shrink-0"
                      style={{ width: 8, height: 13, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                    {config.successLabel}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="inline-block rounded-sm bg-[#E2E8F0] border border-[#CBD5E1] flex-shrink-0"
                      style={{ width: 8, height: 13 }} />
                    {config.failureLabel}
                  </div>
                  <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">
                    {simCount === 0 ? 'Observed data' : `Simulation #${simCount}`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats + hypotheses ── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
              <div className="grid text-xs" style={{ gridTemplateColumns: 'auto 1fr 1fr' }}>
                {/* Header */}
                <div className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)]" />
                {['X (count)', 'p̂'].map(h => (
                  <div key={h} className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)] text-center font-semibold text-[var(--color-muted)]">{h}</div>
                ))}
                {/* Observed row */}
                <div className="px-2 py-1.5 font-semibold text-[var(--color-muted)] bg-slate-50 text-[10px] flex items-center">Obs.</div>
                <div className="px-2 py-1.5 text-center text-[var(--color-text)]">
                  <span className="font-bold">{x}</span>
                  <br />
                  <span className="text-[10px] text-[var(--color-muted)]">n = {n}</span>
                </div>
                <div className="px-2 py-1.5 text-center font-bold text-[var(--color-accent)]">{phat.toFixed(4)}</div>
                {/* Simulated row */}
                {lastSim ? (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-semibold flex items-center text-[var(--color-muted)]">Sim.</div>
                    <div className="px-2 py-1.5 text-center">
                      <span className={`font-bold ${lastSimExtreme ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                        {lastSim.xSim}
                      </span>
                    </div>
                    <div className="px-2 py-1.5 text-center">
                      <span className={`font-bold ${lastSimExtreme ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                        {lastSim.pSim.toFixed(4)}
                      </span>
                      {lastSimExtreme && <span className="text-[10px] text-[var(--color-accent)] ml-0.5">★</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1.5 text-[10px] text-[var(--color-muted)] opacity-30">Sim.</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-30">—</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-30">—</div>
                  </>
                )}
              </div>
              <div className="px-3 py-1 flex items-center justify-between border-t border-[var(--color-border)]">
                <span className="text-[10px] text-[var(--color-muted)]">
                  Simulation #{simCount > 0 ? simCount : '—'}
                </span>
                <span className="text-[10px] text-[var(--color-muted)]">{simCount} total</span>
              </div>
            </div>

            {/* Hypotheses */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-xs text-[var(--color-muted)] space-y-1">
              <div><span className="font-semibold">H₀:</span> p = {config.nullP}</div>
              <div><span className="font-semibold">H₁:</span> {altStatement}</div>
            </div>

            {/* Data summary */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-3 text-xs text-[var(--color-muted)] grid grid-cols-2 gap-2">
              <span>n = {n}</span>
              <span>p₀ = {config.nullP}</span>
              <span>{config.successLabel}: {x}</span>
              <span>{config.failureLabel}: {n - x}</span>
            </div>
          </div>
        </div>

        {/* ── Null distribution ── */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              {/* View toggle */}
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-[10px]">
                {(['proportions', 'counts'] as GraphView[]).map((v, i) => (
                  <button key={v} onClick={() => setGraphView(v)}
                    className={`px-2 py-0.5 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${graphView === v ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}>
                    {v === 'proportions' ? 'Sample Proportions' : 'Counts'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] select-none">
                <input
                  type="checkbox"
                  checked={showNormalCurve}
                  onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                  className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
                Overlay normal curve
              </label>
              <div className="text-[11px] text-[var(--color-muted)] text-right leading-tight">
                <div>Mean = {normMean.toFixed(4)}</div>
                <div>SD = {normSD.toFixed(4)}</div>
              </div>
            </div>
          </div>

          <div className="min-h-0" style={{ height: simCount === 0 ? 120 : 180 }}>
            {simCount === 0
              ? <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
                  Run simulations to build the null distribution
                </div>
              : <OnePropNullDistPlot
                  counts={nullDist}
                  xObs={x}
                  n={n}
                  p0Num={p0Num}
                  alternative={alternative}
                  view={graphView}
                  showNormalCurve={showNormalCurve}
                />
            }
          </div>

          <div className="flex items-center gap-3 pt-1.5 border-t border-[var(--color-border)] flex-shrink-0">
            <span className="text-xs text-[var(--color-muted)]">
              Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span> / {simCount}
            </span>
            <span className="ml-auto text-sm font-bold text-[var(--color-accent)]">
              {pValue !== null
                ? `p ≈ ${pValue < 0.001 ? '< 0.001' : pValue.toFixed(4)}`
                : 'p = —'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-slate-50">
        {([1, 10, 100, 1000] as const).map(cnt => (
          <button key={cnt} onClick={() => runBatch(cnt)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white transition-colors">
            Run {cnt.toLocaleString()}
          </button>
        ))}
        <button onClick={handleReset}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-white transition-colors">
          Reset
        </button>
      </div>
    </div>
  )
}
