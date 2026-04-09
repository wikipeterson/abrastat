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

// ── Coin animation CSS ────────────────────────────────────────────────────────

const COIN_CSS = `
@keyframes coin-flat-spin {
  0%   { transform: scaleX(1)    rotateZ(0deg)  }
  12%  { transform: scaleX(0.06) rotateZ(3deg)  }
  25%  { transform: scaleX(1)    rotateZ(-2deg) }
  37%  { transform: scaleX(0.06) rotateZ(2deg)  }
  50%  { transform: scaleX(1)    rotateZ(-1deg) }
  62%  { transform: scaleX(0.06) rotateZ(3deg)  }
  75%  { transform: scaleX(1)    rotateZ(-2deg) }
  87%  { transform: scaleX(0.06) rotateZ(1deg)  }
  100% { transform: scaleX(1)    rotateZ(0deg)  }
}
@keyframes dot-drop {
  from { transform: translateY(-28px); opacity: 0 }
  to   { transform: translateY(0);     opacity: 1 }
}
`

// ── AbraCoin component ────────────────────────────────────────────────────────

type CoinFace = 'check' | 'x'

function AbraCoin({
  face,
  size,
  spinning = false,
  spinDelay = 0,
  revealDelay = 0,
}: {
  face: CoinFace
  size: number
  spinning?: boolean
  spinDelay?: number
  revealDelay?: number
}) {
  const isCheck = face === 'check'
  const rimSize  = Math.max(1, Math.round(size * 0.055))
  const iconSize = Math.round(size * (isCheck ? 0.52 : 0.46))

  const containerStyle: React.CSSProperties = {
    width:         size,
    height:        size,
    borderRadius:  '50%',
    position:      'relative',
    flexShrink:    0,
    // Spin animation
    animation:     spinning ? `coin-flat-spin 0.22s linear infinite` : 'none',
    animationDelay: spinning ? `${spinDelay}ms` : '0ms',
  }

  const faceStyle: React.CSSProperties = {
    width:       '100%',
    height:      '100%',
    borderRadius: '50%',
    display:     'flex',
    alignItems:  'center',
    justifyContent: 'center',
    position:    'relative',
    overflow:    'hidden',
    boxSizing:   'border-box',
    // Check → teal, X → cool silver
    background: isCheck
      ? 'radial-gradient(circle at 36% 33%, #5CE0DB, #0EA5A0 52%, #097B76)'
      : 'radial-gradient(circle at 36% 33%, #F1F5F9, #CBD5E1 52%, #94A3B8)',
    border: `${rimSize}px solid ${isCheck ? '#0A6663' : '#7C8FA1'}`,
    boxShadow: isCheck
      ? `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(0,80,76,0.30), inset 0 1px 2px rgba(255,255,255,0.28)`
      : `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(0,0,0,0.18), inset 0 1px 2px rgba(255,255,255,0.40)`,
    // Smooth color transition on face change
    transition: spinning
      ? 'none'
      : `background 0.30s ease ${revealDelay}ms, border-color 0.30s ease ${revealDelay}ms, box-shadow 0.30s ease ${revealDelay}ms`,
  }

  return (
    <div style={containerStyle}>
      <div style={faceStyle}>
        {/* Specular highlight */}
        <div style={{
          position:     'absolute',
          top:          '6%',
          left:         '14%',
          width:        '38%',
          height:       '30%',
          borderRadius: '50%',
          background:   'rgba(255,255,255,0.24)',
          transform:    'rotate(-22deg)',
          pointerEvents: 'none',
        }} />
        {/* Icon */}
        <div style={{
          position: 'relative',
          zIndex:   1,
          opacity:   spinning ? 0.6 : 1,
          transition: spinning ? 'none' : `opacity 0.25s ease ${revealDelay}ms`,
        }}>
          {isCheck ? (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <polyline
                points="3.5,12 9,18.5 20.5,6"
                stroke="white"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <line x1="6" y1="6"  x2="18" y2="18" stroke="#3D5166" strokeWidth="2.8" strokeLinecap="round" />
              <line x1="18" y1="6" x2="6"  y2="18" stroke="#3D5166" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Coin grid layout helper ───────────────────────────────────────────────────

interface CoinLayout { size: number; gap: number; perRow: number }

function getCoinLayout(n: number): CoinLayout {
  // Coin size in px; shrinks as n grows
  const size =
    n <=  12 ? 46 :
    n <=  20 ? 40 :
    n <=  35 ? 32 :
    n <=  55 ? 25 :
    n <=  90 ? 19 :
    n <= 160 ? 14 :
               11
  const gap     = Math.max(3, Math.round(size * 0.10))
  const perRow  = Math.max(1, Math.floor(640 / (size + gap)))
  return { size, gap, perRow }
}

// ── Null-distribution dot plot ────────────────────────────────────────────────

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

  const values    = view === 'counts' ? counts : counts.map(c => c / n)
  const obsVal    = view === 'counts' ? xObs : xObs / n
  const nullCenter = view === 'counts' ? n * p0Num : p0Num
  const normSD    = view === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  const padSD = Math.max(normSD * 3.5, Math.abs(obsVal - nullCenter) * 1.3, (view === 'counts' ? 1 : 1 / n))
  const rawMin = Math.min(...(values.length > 0 ? values : [obsVal]), nullCenter - padSD)
  const rawMax = Math.max(...(values.length > 0 ? values : [obsVal]), nullCenter + padSD)
  const rawRange = rawMax - rawMin || 1
  const pad = rawRange * 0.08
  const xLo = rawMin - pad
  const xHi = rawMax + pad
  const xRange = xHi - xLo
  const xOf = (v: number) => ((v - xLo) / xRange) * PW

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

// Step phase for the manual 3-step sequence
type StepPhase = 'observing' | 'spinning' | 'computed' | 'plotted'

export function OnePropSimCard({ cardId, config }: { cardId: string; config: OnePropSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const [phase, setPhase]         = useState<StepPhase>('observing')
  const [pendingSim, setPendingSim] = useState<OnePropResult | null>(null)
  const [displayedSim, setDisplayedSim] = useState<OnePropResult | null>(null)
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

  const altSymbol    = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement = `p ${altSymbol} ${config.nullP}`

  const normMean = graphView === 'counts' ? n * p0Num : p0Num
  const normSD   = graphView === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  // Compute coin layout
  const { size: coinSize, gap: coinGap, perRow } = getCoinLayout(n)

  // Coin faces to display: based on phase
  // 'observing' | 'spinning' → observed faces
  // 'computed' | 'plotted'   → simulated faces (or observed if no sim yet)
  const showSimFaces = (phase === 'computed' || phase === 'plotted') && displayedSim !== null
  const displayFaces = useMemo<CoinFace[]>(() => {
    if (showSimFaces && displayedSim) {
      return displayedSim.outcomes.map(outcome => outcome ? 'check' as CoinFace : 'x' as CoinFace)
    }
    return [
      ...Array(x).fill('check' as CoinFace),
      ...Array(Math.max(0, n - x)).fill('x' as CoinFace),
    ]
  }, [showSimFaces, displayedSim, x, n])

  // Staggered reveal delays (cascade effect when coins land after Compute)
  const revealDelays = useMemo(() => {
    const maxDelay = Math.min(500, n * 20)
    return Array.from({ length: n }, (_, i) => Math.round((i / Math.max(1, n - 1)) * maxDelay))
  }, [n])

  // Staggered spin delays (so they don't all squish at the same time)
  const spinDelays = useMemo(() => {
    return Array.from({ length: n }, (_, i) => Math.round((i / Math.max(1, n)) * 220))
  }, [n])

  // ── Step handlers ──

  function handleRandomize() {
    // Start spinning; run the simulation now but keep it pending
    const sim = runOnePropRandomization(n, p0Num)
    setPendingSim(sim)
    setPhase('spinning')
  }

  function handleCompute() {
    if (!pendingSim) return
    // Reveal the simulated result
    setDisplayedSim(pendingSim)
    setPhase('computed')
  }

  function handlePlot() {
    if (!pendingSim) return
    const newExtreme = isExtremeOneProp(pendingSim.xSim, x, n, p0Num, alternative) ? 1 : 0
    updateExploreCard(cardId, {
      config: {
        ...config,
        nullDist:      [...nullDist, pendingSim.xSim],
        simCount:      simCount + 1,
        extremeCount:  extremeCount + newExtreme,
      }
    })
    setPendingSim(null)
    setPhase('plotted')
  }

  // ── Batch runs (skip animation) ──
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
      setDisplayedSim(last)
      setPendingSim(null)
      setPhase('plotted')
    }
    updateExploreCard(cardId, {
      config: {
        ...config,
        nullDist:     [...nullDist, ...newCounts],
        simCount:     simCount + count,
        extremeCount: extremeCount + newExtreme,
      }
    })
  }

  function handleReset() {
    setPendingSim(null)
    setDisplayedSim(null)
    setPhase('observing')
    updateExploreCard(cardId, {
      config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 }
    })
  }

  // Last displayed sim stats
  const lastSimExtreme = displayedSim
    ? isExtremeOneProp(displayedSim.xSim, x, n, p0Num, alternative)
    : false

  // Status label for the coin panel
  const statusLabel = (() => {
    if (phase === 'observing') return `Observed sample — n = ${n}, X = ${x}`
    if (phase === 'spinning')  return 'Simulating under H₀ …'
    if (phase === 'computed')  return `Simulation result — X = ${displayedSim?.xSim ?? '?'}, p̂ = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
    if (phase === 'plotted')   return `Last result — X = ${displayedSim?.xSim ?? '?'}, p̂ = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
    return ''
  })()

  // Compute panel height based on coin grid
  const coinRows  = Math.ceil(n / perRow)
  const panelH    = Math.max(64, Math.min(coinRows * (coinSize + coinGap) + 16, 220))

  return (
    <div className="flex flex-col h-full">
      <style>{COIN_CSS}</style>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">

        {/* ── Two-column layout: coin panel + stats ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 260px' }}>

          {/* ── Unified coin panel ── */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden flex flex-col">

            {/* Status bar */}
            <div className={`px-3 py-1.5 border-b border-[var(--color-border)] flex items-center gap-2 transition-colors duration-300 ${
              phase === 'spinning' ? 'bg-amber-50' :
              phase === 'computed' ? 'bg-teal-50'  :
              'bg-slate-50'
            }`}>
              {phase === 'spinning' && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {phase === 'computed' && (
                <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
              )}
              {(phase === 'observing' || phase === 'plotted') && (
                <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
              )}
              <span className="text-xs font-medium text-[var(--color-text)]">{statusLabel}</span>
            </div>

            {/* Coin grid */}
            <div
              className="flex-1 flex items-start content-start overflow-hidden px-3 pt-3 pb-1"
              style={{
                display:     'flex',
                flexWrap:    'wrap',
                gap:         coinGap,
                alignContent: 'flex-start',
                minHeight:   panelH,
                maxHeight:   panelH,
              }}
            >
              {displayFaces.map((face, i) => (
                <AbraCoin
                  key={i}
                  face={face}
                  size={coinSize}
                  spinning={phase === 'spinning'}
                  spinDelay={spinDelays[i] ?? 0}
                  revealDelay={phase === 'computed' ? (revealDelays[i] ?? 0) : 0}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="px-3 pb-2 pt-1 flex items-center gap-4 border-t border-[var(--color-border)] bg-slate-50">
              <div className="flex items-center gap-1.5">
                <AbraCoin face="check" size={13} />
                <span className="text-xs text-[var(--color-muted)]">{config.successLabel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AbraCoin face="x" size={13} />
                <span className="text-xs text-[var(--color-muted)]">{config.failureLabel}</span>
              </div>
              {simCount > 0 && (
                <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">
                  {simCount} simulation{simCount !== 1 ? 's' : ''} run
                </span>
              )}
            </div>

            {/* Step buttons */}
            <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
              {/* Randomize: available in observing or plotted */}
              <button
                onClick={handleRandomize}
                disabled={phase === 'spinning' || phase === 'computed'}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  phase === 'observing' || phase === 'plotted'
                    ? 'bg-[var(--color-accent)] text-white hover:opacity-90 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>① Randomize</span>
                {(phase === 'observing' || phase === 'plotted') && <span>→</span>}
              </button>

              {/* Compute: available in spinning */}
              <button
                onClick={handleCompute}
                disabled={phase !== 'spinning'}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  phase === 'spinning'
                    ? 'bg-amber-500 text-white hover:opacity-90 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>② Compute</span>
                {phase === 'spinning' && <span>→</span>}
              </button>

              {/* Plot: available in computed */}
              <button
                onClick={handlePlot}
                disabled={phase !== 'computed'}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  phase === 'computed'
                    ? 'bg-indigo-600 text-white hover:opacity-90 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>③ Plot</span>
                {phase === 'computed' && <span>→</span>}
              </button>
            </div>
          </div>

          {/* ── Stats panel ── */}
          <div className="space-y-3">
            {/* Hypotheses */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-[var(--color-muted)] space-y-1">
              <div><span className="font-semibold text-[var(--color-text)]">H₀:</span> p = {config.nullP}</div>
              <div><span className="font-semibold text-[var(--color-text)]">H₁:</span> {altStatement}</div>
            </div>

            {/* Observed summary */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
              <div className="px-2.5 py-1.5 bg-slate-50 border-b border-[var(--color-border)]">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Observed Sample</span>
              </div>
              <div className="px-2.5 py-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="text-[var(--color-muted)]">n</span>
                <span className="font-bold text-right">{n}</span>
                <span className="text-[var(--color-muted)]">X ({config.successLabel})</span>
                <span className="font-bold text-right">{x}</span>
                <span className="text-[var(--color-muted)]">p̂</span>
                <span className="font-bold text-[var(--color-accent)] text-right">{phat.toFixed(4)}</span>
              </div>
            </div>

            {/* Latest simulation result */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
              <div className="px-2.5 py-1.5 bg-slate-50 border-b border-[var(--color-border)]">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Latest Simulation</span>
              </div>
              <div className="px-2.5 py-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                {displayedSim ? (
                  <>
                    <span className="text-[var(--color-muted)]">X (null)</span>
                    <span className={`font-bold text-right ${lastSimExtreme ? 'text-[var(--color-accent)]' : ''}`}>
                      {displayedSim.xSim}
                      {lastSimExtreme && <span className="ml-0.5 text-[9px]">★</span>}
                    </span>
                    <span className="text-[var(--color-muted)]">p̂ (null)</span>
                    <span className={`font-bold text-right ${lastSimExtreme ? 'text-[var(--color-accent)]' : ''}`}>
                      {displayedSim.pSim.toFixed(4)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[var(--color-muted)]">X (null)</span>
                    <span className="text-[var(--color-muted)] opacity-40 text-right">—</span>
                    <span className="text-[var(--color-muted)]">p̂ (null)</span>
                    <span className="text-[var(--color-muted)] opacity-40 text-right">—</span>
                  </>
                )}
                <span className="text-[var(--color-muted)]">p₀</span>
                <span className="font-mono text-right">{config.nullP}</span>
                <span className="text-[var(--color-muted)]">Simulations</span>
                <span className="font-bold text-right">{simCount}</span>
              </div>
            </div>

            {/* Normal overlay stats */}
            {showNormalCurve && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-2.5 py-2 text-xs text-[var(--color-muted)] space-y-0.5">
                <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Normal Overlay</div>
                <div>Mean = {normMean.toFixed(4)}</div>
                <div>SD = {normSD.toFixed(4)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Null distribution ── */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-[10px]">
                {(['proportions', 'counts'] as GraphView[]).map((v, i) => (
                  <button key={v} onClick={() => setGraphView(v)}
                    className={`px-2 py-0.5 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${graphView === v ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}>
                    {v === 'proportions' ? 'Sample Proportions' : 'Counts'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] select-none">
              <input
                type="checkbox"
                checked={showNormalCurve}
                onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              Overlay normal curve
            </label>
          </div>

          <div className="min-h-0" style={{ height: simCount === 0 ? 120 : 180 }}>
            {simCount === 0
              ? <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
                  Use the step buttons above or batch-run to build the null distribution
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

      {/* ── Batch run controls ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-slate-50">
        <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide mr-1">Batch</span>
        {([10, 100, 1000] as const).map(cnt => (
          <button key={cnt} onClick={() => runBatch(cnt)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white transition-colors">
            Run {cnt.toLocaleString()}
          </button>
        ))}
        <button onClick={handleReset}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-white transition-colors ml-auto">
          Reset
        </button>
      </div>
    </div>
  )
}
