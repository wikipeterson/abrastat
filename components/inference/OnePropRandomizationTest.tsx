'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
@keyframes coin-flip-spin {
  0%   { transform: translateY(0) rotateY(0deg) scale(1); }
  20%  { transform: translateY(-7%) rotateY(88deg) scale(0.92, 1.04); }
  50%  { transform: translateY(-12%) rotateY(180deg) scale(1.01); }
  80%  { transform: translateY(-7%) rotateY(272deg) scale(0.92, 1.04); }
  100% { transform: translateY(0) rotateY(360deg) scale(1); }
}

@keyframes coin-spin-shimmer {
  0%   { opacity: 0.18; transform: translateX(-18%) rotate(-22deg); }
  50%  { opacity: 0.42; transform: translateX(16%) rotate(-22deg); }
  100% { opacity: 0.18; transform: translateX(-18%) rotate(-22deg); }
}
`

// ── AbraCoin component ────────────────────────────────────────────────────────

type CoinFace = 'heads' | 'tails'

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
  const isHeads = face === 'heads'
  const rimSize  = Math.max(2, Math.round(size * 0.06))
  const innerRingInset = Math.max(3, Math.round(size * 0.085))
  const innerInset = Math.max(5, Math.round(size * 0.135))
  const reliefInset = Math.max(9, Math.round(size * 0.225))
  const letterSize = Math.max(10, Math.round(size * 0.36))
  const goldOuter = 'linear-gradient(145deg, #8B6100 0%, #C99300 18%, #F8DD72 40%, #C68800 68%, #7B5100 100%)'
  const goldInner = 'radial-gradient(circle at 32% 28%, #FFF2A3 0%, #F7D24E 24%, #E0A815 58%, #A86900 100%)'
  const silverOuter = 'linear-gradient(145deg, #70757E 0%, #B8BDC5 18%, #F5F7FA 40%, #A0A7B0 68%, #666B73 100%)'
  const silverInner = 'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #E7EBEF 26%, #C7CDD4 58%, #969DA6 100%)'
  const rimShadow = isHeads ? 'rgba(104,65,0,0.45)' : 'rgba(70,78,88,0.34)'
  const baseRotation = spinning ? 'rotateY(0deg)' : isHeads ? 'rotateY(0deg)' : 'rotateY(180deg)'

  function CoinSurface({
    side,
    rotate,
  }: {
    side: CoinFace
    rotate: string
  }) {
    const sideIsHeads = side === 'heads'
    const rimStroke = sideIsHeads ? '#8B6100' : '#70757E'
    const innerRingStroke = sideIsHeads ? 'rgba(255,240,170,0.9)' : 'rgba(255,255,255,0.88)'
    const edgeHighlight = sideIsHeads ? 'rgba(255,245,180,0.78)' : 'rgba(255,255,255,0.72)'
    const reliefStroke = sideIsHeads ? 'rgba(142,99,0,0.42)' : 'rgba(98,106,116,0.35)'
    const stampColor = sideIsHeads ? '#865700' : '#5F6771'
    const stampHighlight = sideIsHeads ? 'rgba(255,244,188,0.7)' : 'rgba(255,255,255,0.75)'

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: rotate,
        }}
      >
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: sideIsHeads ? goldOuter : silverOuter,
          border: `${rimSize}px solid ${rimStroke}`,
          boxSizing: 'border-box',
        }} />
        <div style={{
          position: 'absolute',
          inset: innerRingInset,
          borderRadius: '50%',
          border: `${Math.max(1, Math.round(size * 0.025))}px solid ${innerRingStroke}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.14)',
        }} />
        <div style={{
          position: 'absolute',
          inset: innerInset,
          borderRadius: '50%',
          background: sideIsHeads ? goldInner : silverInner,
          boxShadow: `inset 0 2px 2px ${edgeHighlight}, inset 0 -4px 6px rgba(0,0,0,0.18)`,
        }} />
        <div style={{
          position: 'absolute',
          inset: reliefInset,
          borderRadius: '50%',
          border: `${Math.max(1, Math.round(size * 0.028))}px solid ${reliefStroke}`,
          boxShadow: `inset 0 1px 0 ${edgeHighlight}, inset 0 -2px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.15)`,
        }} />
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '16%',
          width: '42%',
          height: '28%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.32)',
          transform: 'rotate(-20deg)',
          filter: 'blur(0.4px)',
          pointerEvents: 'none',
          animation: spinning ? 'coin-spin-shimmer 0.42s ease-in-out infinite' : 'none',
          animationDelay: spinning ? `${spinDelay}ms` : '0ms',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          fontSize: letterSize,
          lineHeight: 1,
          fontWeight: 700,
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: stampColor,
          textShadow: `0 1px 0 ${stampHighlight}, 0 -1px 0 rgba(0,0,0,0.22)`,
          transform: 'translateY(-2%)',
          letterSpacing: '0.02em',
          opacity: spinning ? 0.92 : 1,
          transition: spinning ? 'none' : `opacity 0.25s ease ${revealDelay}ms`,
        }}>
          {sideIsHeads ? 'H' : 'T'}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      position: 'relative',
      flexShrink: 0,
      perspective: `${Math.max(140, Math.round(size * 5))}px`,
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        position: 'relative',
        transform: baseRotation,
        transformStyle: 'preserve-3d',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          position: 'relative',
          boxSizing: 'border-box',
          boxShadow: spinning
            ? `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(22,52,76,0.18), inset 0 1px 2px rgba(255,255,255,0.24)`
            : `0 ${Math.round(size * 0.08)}px ${Math.round(size * 0.2)}px ${rimShadow}, inset 0 1px 2px rgba(255,255,255,0.4)`,
          transformStyle: 'preserve-3d',
          animation: spinning ? 'coin-flip-spin 0.32s linear infinite' : 'none',
          animationDelay: spinning ? `${spinDelay}ms` : '0ms',
          transition: spinning
            ? 'none'
            : `box-shadow 0.30s ease ${revealDelay}ms`,
        }}>
          <CoinSurface side="heads" rotate="rotateY(0deg)" />
          <CoinSurface side="tails" rotate="rotateY(180deg)" />
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
  return v.toFixed(2)
}

function formatDistance(v: number, range: number): string {
  const abs = Math.abs(v)
  if (range >= 100) return abs.toFixed(0)
  if (range >= 10) return abs.toFixed(1)
  if (range >= 1) return abs.toFixed(2)
  return abs.toFixed(4)
}

function niceTickStep(raw: number, integerOnly = false): number {
  if (!Number.isFinite(raw) || raw <= 0) return integerOnly ? 1 : 0.1
  if (integerOnly) return Math.max(1, Math.ceil(raw))
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const normalized = raw / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

function altOperator(alternative: Alternative): string {
  if (alternative === 'less') return '<'
  if (alternative === 'greater') return '>'
  return '≠'
}

function snapThresholdCount(threshold: number, n: number): number {
  const scaled = threshold * n
  const nearest = Math.round(scaled)
  return Math.abs(scaled - nearest) <= 0.01 ? nearest : scaled
}

function OnePropNullDistPlot({
  counts, xObs, n, p0Num, alternative, view, showNormalCurve = false, thresholdVal,
}: {
  counts: number[]
  xObs: number
  n: number
  p0Num: number
  alternative: Alternative
  view: GraphView
  showNormalCurve?: boolean
  thresholdVal?: number
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 30, l: 16 }
  const plotHeight = 320
  const tickFontSize = 13
  const axisLabelFontSize = 14
  const markerFontSize = 11
  const SVG_H = plotHeight + MG.t + MG.b
  const PW = SVG_W - MG.l - MG.r
  const PH = SVG_H - MG.t - MG.b

  const values    = view === 'counts' ? counts : counts.map(c => c / n)
  const obsVal    = view === 'counts' ? xObs : xObs / n
  const nullCenter = view === 'counts' ? n * p0Num : p0Num
  const normSD    = view === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  const dataMaxDist = Math.max(
    ...((values.length > 0 ? values : [obsVal]).map(v => Math.abs(v - nullCenter))),
    Math.abs(obsVal - nullCenter),
  )
  const halfRange = Math.max(
    normSD * 4,
    dataMaxDist * 1.18,
    view === 'counts' ? 2 : 2 / Math.max(1, n),
  )
  const xLo = nullCenter - halfRange
  const xHi = nullCenter + halfRange
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

  // Use custom threshold for shading/coloring if provided and valid
  const thresh = (thresholdVal !== undefined && Number.isFinite(thresholdVal)) ? thresholdVal : obsVal

  const seenC = new Map<number, number>()
  const dotStep = Math.min(6, yScale)
  const dotR = Math.max(0.55, Math.min(2.6, dotStep / 2 - 0.15))
  const showHistogram = values.length >= 120
  const circles = normalizedValues.map(v => {
    const si = seenC.get(v) ?? 0
    seenC.set(v, si + 1)
    const dist = Math.abs(thresh - nullCenter)
    const extreme = alternative === 'greater' ? v >= thresh
                  : alternative === 'less'    ? v <= thresh
                  : Math.abs(v - nullCenter) >= dist
    return { cx: xOf(v), cy: PH - (si + 1) * dotStep + dotStep / 2, extreme }
  })

  const normalPath = normalStats
    ? normalStats.samples
        .map(s => `${xOf(s.x)},${Math.min(PH, Math.max(0, PH - s.expectedCount * yScale))}`)
        .join(' ')
    : ''

  // Filled area under normal curve in extreme region
  const normalFillPath = (() => {
    if (!normalStats) return ''
    const samp = normalStats.samples
    const yPt = (s: { x: number; expectedCount: number }) =>
      Math.min(PH, Math.max(0, PH - s.expectedCount * yScale))
    const makeFill = (pts: typeof samp) => {
      if (pts.length === 0) return ''
      const inner = pts.map(s => `${xOf(s.x)},${yPt(s)}`).join(' L')
      return `M${xOf(pts[0].x)},${PH} L${inner} L${xOf(pts[pts.length - 1].x)},${PH} Z`
    }
    const threshDist = Math.abs(thresh - nullCenter)
    if (alternative === 'greater') return makeFill(samp.filter(s => s.x >= thresh))
    if (alternative === 'less')    return makeFill(samp.filter(s => s.x <= thresh))
    return makeFill(samp.filter(s => s.x <= nullCenter - threshDist)) + ' ' +
           makeFill(samp.filter(s => s.x >= nullCenter + threshDist))
  })()

  const histogramBars = useMemo(() => {
    if (!showHistogram) return []
    const binCount = Math.min(28, Math.max(10, Math.round(Math.sqrt(values.length))))
    const binWidth = xRange / binCount
    const bins = Array.from({ length: binCount }, (_, index) => ({
      x0: xLo + index * binWidth,
      x1: xLo + (index + 1) * binWidth,
      count: 0,
      extreme: false,
    }))
    normalizedValues.forEach(value => {
      const ratio = Math.max(0, Math.min(0.999999, (value - xLo) / xRange))
      const index = Math.min(binCount - 1, Math.floor(ratio * binCount))
      bins[index].count += 1
    })
    bins.forEach(bin => {
      const mid = (bin.x0 + bin.x1) / 2
      const dist = Math.abs(thresh - nullCenter)
      bin.extreme = alternative === 'greater'
        ? mid >= thresh
        : alternative === 'less'
          ? mid <= thresh
          : Math.abs(mid - nullCenter) >= dist
    })
    return bins.filter(bin => bin.count > 0)
  }, [alternative, normalizedValues, nullCenter, showHistogram, thresh, values.length, xLo, xRange])

  const obsX = xOf(obsVal)
  const threshX = xOf(thresh)
  const showThreshLine = Math.abs(thresh - obsVal) > (view === 'counts' ? 0.5 : 0.0001)

  let shade = ''
  if (alternative === 'greater') {
    shade = `M${threshX},0 H${PW} V${PH} H${threshX} Z`
  } else if (alternative === 'less') {
    shade = `M0,0 H${threshX} V${PH} H0 Z`
  } else {
    const dist = Math.abs(thresh - nullCenter)
    const xL = Math.max(0, xOf(nullCenter - dist))
    const xR = Math.min(PW, xOf(nullCenter + dist))
    shade = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z`
  }

  const ticks = view === 'counts'
    ? (() => {
        const center = Math.round(nullCenter)
        const step = niceTickStep(halfRange / 2, true)
        return Array.from({ length: 5 }, (_, i) => center + (i - 2) * step)
      })()
    : (() => {
        const start = Math.ceil(xLo * 10) / 10
        const end = Math.floor(xHi * 10) / 10
        const values = Array.from(
          { length: Math.max(0, Math.round((end - start) / 0.1) + 1) },
          (_, i) => Number((start + i * 0.1).toFixed(10)),
        )
        return values.length > 0 ? values : [Number(nullCenter.toFixed(2))]
      })()

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop-full{from{transform:translateY(-${PH}px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH} /></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        {/* Light shaded extreme region */}
        <path d={shade} fill="#0EA5A0" opacity={0.10} />
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#111111" strokeWidth={1.5} />
        {ticks.map((v, i) => (
          <g key={i} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="#111111" strokeWidth={1} />
            <text y={18} textAnchor="middle" fontSize={tickFontSize} fill="#111111" fontFamily="DM Sans,sans-serif">
              {view === 'counts' ? Math.round(v).toString() : formatTick(v, xRange)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {/* Normal curve extreme-region fill (darker) */}
          {normalFillPath && (
            <path d={normalFillPath} fill="#0EA5A0" opacity={0.28} />
          )}
          {showHistogram
            ? histogramBars.map((bar, i) => {
                const x0 = xOf(bar.x0)
                const x1 = xOf(bar.x1)
                const barHeight = bar.count * yScale
                return (
                  <rect
                    key={i}
                    x={x0 + 0.8}
                    y={Math.max(0, PH - barHeight)}
                    width={Math.max(1.2, x1 - x0 - 1.6)}
                    height={Math.max(1.2, barHeight)}
                    rx={2}
                    fill={bar.extreme ? '#0EA5A0' : '#111111'}
                    opacity={0.82}
                  />
                )
              })
            : circles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={dotR}
                  fill={c.extreme ? '#0EA5A0' : '#111111'} opacity={0.85}
                  style={i === circles.length - 1 && values.length > 0
                    ? { animation: 'dot-drop-full 700ms ease-out' } : undefined}
                />
              ))}
          {normalPath && (
            <polyline points={normalPath} fill="none" stroke="#F59E0B" strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          )}
        </g>
        {/* Obs line — always red */}
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3" />
        <text x={obsX + (obsVal >= nullCenter ? 3 : -3)} y={7}
          textAnchor={obsVal >= nullCenter ? 'start' : 'end'}
          fontSize={markerFontSize} fill="#EF4444" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        {/* Custom threshold line — teal, only when it differs from obs */}
        {showThreshLine && (
          <>
            <line x1={threshX} y1={0} x2={threshX} y2={PH}
              stroke="#0EA5A0" strokeWidth={1.6} strokeDasharray="5,3" />
            <text x={threshX + (thresh >= nullCenter ? 3 : -3)} y={16}
              textAnchor={thresh >= nullCenter ? 'start' : 'end'}
              fontSize={markerFontSize} fill="#0EA5A0" fontFamily="DM Sans,sans-serif" fontWeight="600">t</text>
          </>
        )}
        <text x={PW / 2} y={PH + 30} textAnchor="middle" fontSize={axisLabelFontSize} fill="#111111" fontFamily="DM Sans,sans-serif">
          {view === 'counts' ? 'Simulated X (count of successes)' : 'Simulated p̂'}
        </text>
      </g>
    </svg>
  )
}

// ── Config card ───────────────────────────────────────────────────────────────

type SourceMode = 'data' | 'manual'
interface ConfigProps {
  cardId: string
  config: OnePropRandomizationCardConfig
  onClearZone: (z: string) => void
  onAssignZone: (zone: 'var1', colId: string) => boolean
}

export function OnePropRandomizationTest({ cardId, config, onClearZone, onAssignZone }: ConfigProps) {
  const { grid, updateExploreCard } = useStore()

  const stage = config.stage ?? 'setup'
  const sourceMode = config.sourceMode ?? 'manual'
  const successLevel = config.successLevel ?? ''
  const manualX = config.manualX ?? ''
  const manualN = config.manualN ?? ''
  const manualLabel = config.manualLabel ?? 'Success'
  const nullP = config.nullP ?? '0.5'
  const alternative = config.alternative ?? 'two'
  const nullDist = config.nullDist ?? []
  const simCount = config.simCount ?? 0
  const extremeCount = config.extremeCount ?? 0
  const graphView = config.graphView ?? 'proportions'
  const showNormalCurve = config.showNormalCurve ?? false
  const cardSizeTarget = stage === 'setup'
    ? { width: 1180, height: 860 }
    : stage === 'conclude'
      ? { width: 1260, height: 980 }
      : { width: 1260, height: 900 }

  const [phase, setPhase] = useState<StepPhase>('observing')
  const [pendingSim, setPendingSim] = useState<OnePropResult | null>(null)
  const [displayedSim, setDisplayedSim] = useState<OnePropResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState<{ current: number; total: number } | null>(null)
  const cancelRef = useRef(false)

  const catCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null

  function patchConfig(partial: Partial<OnePropRandomizationCardConfig>) {
    updateExploreCard(cardId, {
      config: {
        ...config,
        stage,
        sourceMode,
        successLevel,
        manualX,
        manualN,
        manualLabel,
        nullP,
        alternative,
        nullDist,
        simCount,
        extremeCount,
        showNormalCurve,
        graphView,
        customThreshold: config.customThreshold ?? '',
        ...partial,
      },
    })
  }

  useEffect(() => {
    updateExploreCard(cardId, cardSizeTarget)
  }, [cardId, cardSizeTarget.height, cardSizeTarget.width, updateExploreCard])

  function handleNativeDrop(e: React.DragEvent) {
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    e.preventDefault()
    onAssignZone('var1', colId)
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
    if (sourceMode !== 'data' || catLevels.length === 0) return
    if (!successLevel || !catLevels.includes(successLevel)) {
      patchConfig({ successLevel: catLevels[0] })
    }
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
  const canStartSimulating = error === null && n > 0 && p0Valid
  const pValue = simCount > 0 ? extremeCount / simCount : null
  const customThreshold = config.customThreshold && config.customThreshold !== ''
    ? config.customThreshold
    : (graphView === 'counts' ? String(x) : (x / Math.max(1, n)).toFixed(4))
  const customThresholdNum = parseFloat(customThreshold)
  const thresholdOnCountScale = Number.isFinite(customThresholdNum)
    ? (graphView === 'counts' ? customThresholdNum : snapThresholdCount(customThresholdNum, n))
    : Number.NaN
  const nullCenterCount = n * p0Num
  const customPValue = useMemo(() => {
    if (nullDist.length === 0 || !Number.isFinite(thresholdOnCountScale)) return null
    const dist = Math.abs(thresholdOnCountScale - nullCenterCount)
    const extreme = nullDist.filter(xSim => {
      if (alternative === 'greater') return xSim >= thresholdOnCountScale
      if (alternative === 'less') return xSim <= thresholdOnCountScale
      return Math.abs(xSim - nullCenterCount) >= dist
    }).length
    return extreme / nullDist.length
  }, [alternative, nullCenterCount, nullDist, thresholdOnCountScale])

  useEffect(() => {
    if (!config.customThreshold) {
      patchConfig({ customThreshold })
    }
  }, [graphView, x])

  const successLabel = sourceMode === 'manual'
    ? (manualLabel.trim() || 'Success')
    : successLevel

  function goToStage(nextStage: 'setup' | 'simulate' | 'conclude') {
    patchConfig({ stage: nextStage })
  }

  function handleStartSimulating() {
    if (!canStartSimulating) return
    goToStage('simulate')
  }

  function updateAlternative(next: Alternative) {
    const nextExtremeCount = nullDist.reduce((countExtreme, xSim) => (
      countExtreme + (isExtremeOneProp(xSim, x, n, p0Num, next) ? 1 : 0)
    ), 0)
    patchConfig({
      alternative: next,
      extremeCount: nextExtremeCount,
    })
  }

  function handleRandomize() {
    const sim = runOnePropRandomization(n, p0Num)
    setPendingSim(sim)
    setPhase('spinning')
  }

  function handleCompute() {
    if (!pendingSim) return
    setDisplayedSim(pendingSim)
    setPhase('computed')
  }

  function handlePlot() {
    if (!pendingSim) return
    const nextExtreme = isExtremeOneProp(pendingSim.xSim, x, n, p0Num, alternative) ? 1 : 0
    patchConfig({
      nullDist: [...nullDist, pendingSim.xSim],
      simCount: simCount + 1,
      extremeCount: extremeCount + nextExtreme,
    })
    setPendingSim(null)
    setPhase('plotted')
  }

  function runBatch(count: number) {
    if (!Number.isFinite(p0Num) || p0Num < 0 || p0Num > 1) return
    let nextExtreme = 0
    let last: OnePropResult | null = null
    const newCounts: number[] = []
    for (let i = 0; i < count; i++) {
      const result = runOnePropRandomization(n, p0Num)
      last = result
      newCounts.push(result.xSim)
      if (isExtremeOneProp(result.xSim, x, n, p0Num, alternative)) nextExtreme += 1
    }
    if (last) {
      setDisplayedSim(last)
      setPendingSim(null)
      setPhase('plotted')
    }
    patchConfig({
      nullDist: [...nullDist, ...newCounts],
      simCount: simCount + count,
      extremeCount: extremeCount + nextExtreme,
    })
  }

  function handleReset() {
    cancelRef.current = true
    setIsRunning(false)
    setRunProgress(null)
    setPendingSim(null)
    setDisplayedSim(null)
    setPhase('observing')
    patchConfig({
      nullDist: [],
      simCount: 0,
      extremeCount: 0,
      customThreshold: graphView === 'counts' ? String(x) : (x / Math.max(1, n)).toFixed(4),
    })
  }

  function sleep(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)) }

  async function runAnimated(count: number) {
    if (isRunning || !Number.isFinite(p0Num) || p0Num < 0 || p0Num > 1) return
    cancelRef.current = false
    setIsRunning(true)

    const spinMs = count === 1 ? 1200 : 360
    const computeMs = count === 1 ? 450 : 130
    const pauseMs = count === 1 ? 80 : 40

    let localNullDist = [...nullDist]
    let localSimCount = simCount
    let localExtremeCount = extremeCount

    for (let i = 0; i < count; i += 1) {
      if (cancelRef.current) break
      setRunProgress({ current: i + 1, total: count })
      const sim = runOnePropRandomization(n, p0Num)
      setPendingSim(sim)
      setPhase('spinning')
      await sleep(spinMs)
      if (cancelRef.current) break
      setDisplayedSim(sim)
      setPhase('computed')
      await sleep(computeMs)
      if (cancelRef.current) break

      const nextExtreme = isExtremeOneProp(sim.xSim, x, n, p0Num, alternative) ? 1 : 0
      localNullDist = [...localNullDist, sim.xSim]
      localSimCount += 1
      localExtremeCount += nextExtreme
      patchConfig({
        nullDist: localNullDist,
        simCount: localSimCount,
        extremeCount: localExtremeCount,
      })
      setPendingSim(null)
      setPhase('plotted')
      if (i < count - 1) await sleep(pauseMs)
    }

    setIsRunning(false)
    setRunProgress(null)
    cancelRef.current = false
  }

  function stopRunning() {
    cancelRef.current = true
  }

  const normMean = graphView === 'counts' ? n * p0Num : p0Num
  const normSD   = graphView === 'counts'
    ? Math.sqrt(Math.max(0, n * p0Num * (1 - p0Num)))
    : Math.sqrt(Math.max(0, p0Num * (1 - p0Num) / Math.max(1, n)))

  const { size: coinSize, gap: coinGap, perRow } = getCoinLayout(n)
  const showSimFaces = (phase === 'computed' || phase === 'plotted') && displayedSim !== null
  const displayFaces = useMemo<CoinFace[]>(() => {
    if (showSimFaces && displayedSim) {
      return displayedSim.outcomes.map(outcome => outcome ? 'heads' as CoinFace : 'tails' as CoinFace)
    }
    return [
      ...Array(x).fill('heads' as CoinFace),
      ...Array(Math.max(0, n - x)).fill('tails' as CoinFace),
    ]
  }, [displayedSim, n, showSimFaces, x])
  const revealDelays = useMemo(() => {
    const maxDelay = Math.min(500, n * 20)
    return Array.from({ length: n }, (_, i) => Math.round((i / Math.max(1, n - 1)) * maxDelay))
  }, [n])
  const spinDelays = useMemo(
    () => Array.from({ length: n }, (_, i) => Math.round((i / Math.max(1, n)) * 220)),
    [n],
  )
  const coinRows = Math.ceil(n / perRow)
  const panelH = Math.max(64, Math.min(coinRows * (coinSize + coinGap) + 16, 220))
  const hasEnoughToConclude = simCount >= 100

  const firstRunGuidance = (() => {
    if (simCount > 0) return null
    if (phase === 'observing') return `Flipping ${n} coins as if p = ${nullP} — the null world.`
    if (phase === 'spinning') return `Now compute the simulated result from those ${n} flips.`
    if (phase === 'computed') return `${displayedSim?.xSim ?? '?'} heads gives p̂* = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}. Plot that one simulated sample.`
    return null
  })()

  const verdict = (() => {
    if (simCount < 100) {
      return 'You need more simulated samples before the p-value is stable enough to interpret confidently.'
    }
    const shown = customPValue ?? pValue
    if (shown == null) return 'Keep simulating to build the null distribution.'
    if (shown <= 0.05) {
      return `A result this extreme would be unusual if the null hypothesis were true, so the data give evidence for the alternative.`
    }
    return `Results like this are not especially rare under the null hypothesis, so the data do not give strong evidence for the alternative.`
  })()

  const statusLabel = (() => {
    if (phase === 'observing') return `Observed sample — n = ${n}, X = ${x}`
    if (phase === 'spinning') return 'Simulating under H₀ …'
    if (phase === 'computed') return `Simulation result — X = ${displayedSim?.xSim ?? '?'}, p̂* = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
    return `Last result — X = ${displayedSim?.xSim ?? '?'}, p̂* = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
  })()

  const stepLabels = [
    { key: 'setup' as const, label: 'Set up', enabled: true },
    { key: 'simulate' as const, label: 'Run', enabled: true },
    { key: 'conclude' as const, label: 'Conclude', enabled: hasEnoughToConclude },
  ]

  const stepper = (
    <div className="flex flex-wrap items-center gap-3 md:flex-nowrap md:gap-4">
      {stepLabels.map((step, index) => {
        const active = stage === step.key
        return (
          <div key={step.key} className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              disabled={!step.enabled}
              onClick={() => step.enabled && goToStage(step.key)}
              className="flex items-center gap-3 disabled:cursor-not-allowed"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : step.enabled
                      ? 'bg-[var(--color-accent-light)] text-[var(--color-muted)]'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`text-sm font-semibold transition-colors ${
                  active
                    ? 'text-[var(--color-text)]'
                    : step.enabled
                      ? 'text-[var(--color-muted)]'
                      : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </button>
            {index < stepLabels.length - 1 && (
              <div className="hidden h-px flex-1 bg-[var(--color-border)] md:block" />
            )}
          </div>
        )
      })}
    </div>
  )

  const setupCard = (
      <div className="space-y-6 px-3 py-2">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-[var(--color-text)] px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-white">
            Inference
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
            Randomization Test
          </div>
        </div>

        {stepper}

        <div className="text-[1.35rem] font-semibold italic leading-snug text-[var(--color-text)]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          If the true proportion were really p₀, how unusual is what we saw?
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
              Null hypothesis
            </div>
            <div className="rounded-[22px] bg-[var(--color-accent-light)] px-6 py-5">
              <div className="flex flex-wrap items-center gap-4 text-[1.1rem] font-semibold text-[var(--color-text)]">
                <span>H₀</span>
                <span>:</span>
                <span>p =</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={nullP}
                  onChange={e => patchConfig({ nullP: e.target.value })}
                  className="w-28 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-center text-[1.1rem] font-semibold text-[var(--color-text)] shadow-sm"
                />
                <span className="ml-4">Hₐ</span>
                <span>:</span>
                <span>p</span>
                <select
                  value={alternative}
                  onChange={e => updateAlternative(e.target.value as Alternative)}
                  className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-[1.05rem] font-semibold text-[var(--color-text)] shadow-sm"
                >
                  <option value="less">&lt;</option>
                  <option value="two">≠</option>
                  <option value="greater">&gt;</option>
                </select>
                <span>p₀</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">
              Observed data
            </div>

            {sourceMode === 'data' ? (
              <div className="space-y-4 rounded-[22px] bg-white px-0 py-0">
                <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop}>
                  <DropZone
                    id={`${cardId}:var1`}
                    label="Categorical Variable"
                    hint="categorical only"
                    assignedCol={catCol}
                    onClear={() => onClearZone('var1')}
                    onAssign={colId => onAssignZone('var1', colId)}
                    allowedTypes={['categorical']}
                  />
                </div>
                {catLevels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-[var(--color-muted)]">Success</span>
                    <select
                      value={successLevel}
                      onChange={e => patchConfig({ successLevel: e.target.value })}
                      className="min-w-[220px] rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-lg font-medium text-[var(--color-text)]"
                    >
                      {catLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <span className="ml-auto text-base text-[var(--color-muted)]">
                      observed <PHat /> = <span className="font-semibold text-[var(--color-accent)]">{phat !== null ? phat.toFixed(2) : '—'}</span>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4 text-[1.05rem] text-[var(--color-muted)]">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={manualX}
                  onChange={e => patchConfig({ manualX: e.target.value })}
                  className="w-28 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-center text-[1.1rem] font-semibold text-[var(--color-text)]"
                />
                <span>successes out of</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={manualN}
                  onChange={e => patchConfig({ manualN: e.target.value })}
                  className="w-28 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-center text-[1.1rem] font-semibold text-[var(--color-text)]"
                />
                <span>trials</span>
                <span className="ml-auto text-base">
                  observed <PHat /> = <span className="text-[1.15rem] font-semibold text-[var(--color-accent)]">{phat !== null ? phat.toFixed(2) : '—'}</span>
                </span>
              </div>
            )}

            {error && <div className="text-sm text-rose-500">{error}</div>}
          </div>
        </div>

        <button
          onClick={handleStartSimulating}
          disabled={!canStartSimulating}
          className="w-full rounded-[20px] bg-[var(--color-accent)] px-6 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start simulating →
        </button>
      </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <style>{COIN_CSS}</style>
      {stage === 'setup' && setupCard}

      {stage !== 'setup' && (
        <>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
            <div className="mb-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">Randomization Test</div>
                  <h3 className="text-[30px] font-semibold leading-none text-[var(--color-text)]">One proportion</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {stage === 'simulate' && (
                    <button
                      type="button"
                      onClick={() => goToStage('conclude')}
                      disabled={!hasEnoughToConclude}
                      className="rounded-lg bg-[var(--color-gold)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Conclude →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => goToStage('setup')}
                    className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]"
                  >
                    ← Edit setup
                  </button>
                </div>
              </div>

              {stepper}

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  H₀: p = <span className="font-semibold">{nullP}</span>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  Hₐ: p <span className="px-1 font-semibold">{altOperator(alternative)}</span> <span className="font-semibold">{nullP}</span>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  n <span className="font-semibold">{n}</span>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  X <span className="font-semibold">{x}</span>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  <PHat className="mr-1" /> <span className="font-semibold">{phat?.toFixed(4) ?? '—'}</span>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
                  Repetitions <span className="font-semibold">{simCount}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_360px]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-light)] px-3 py-2">
                    {phase === 'spinning' ? (
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                    ) : phase === 'computed' ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-border)]" />
                    )}
                    <span className="text-xs font-medium text-[var(--color-text)]">{statusLabel}</span>
                  </div>
                  <div
                    className="flex flex-wrap content-start overflow-hidden px-3 pb-2 pt-3"
                    style={{ gap: coinGap, alignContent: 'flex-start', minHeight: panelH, maxHeight: panelH }}
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
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">One repetition</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleRandomize}
                      disabled={isRunning || phase === 'spinning' || phase === 'computed'}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        !isRunning && (phase === 'observing' || phase === 'plotted')
                          ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                          : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                      }`}
                    >
                      1. Randomize
                    </button>
                    <span className="text-[var(--color-muted)]">→</span>
                    <button
                      onClick={handleCompute}
                      disabled={isRunning || phase !== 'spinning'}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        !isRunning && phase === 'spinning'
                          ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                          : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                      }`}
                    >
                      2. Compute
                    </button>
                    <span className="text-[var(--color-muted)]">→</span>
                    <button
                      onClick={handlePlot}
                      disabled={isRunning || phase !== 'computed'}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        !isRunning && phase === 'computed'
                          ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                          : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                      }`}
                    >
                      3. Plot
                    </button>
                  </div>
                  {firstRunGuidance && (
                    <p className="mt-3 text-sm text-[var(--color-muted)]">{firstRunGuidance}</p>
                  )}
                </div>

                {(simCount > 0 || stage === 'conclude') && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">Speed up</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[10, 100, 1000].map(cnt => (
                        <button key={cnt} onClick={() => (cnt === 10 ? runAnimated(10) : runBatch(cnt))} disabled={isRunning}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            isRunning
                              ? 'border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                              : 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)]'
                          }`}>
                          Run {cnt.toLocaleString()}
                        </button>
                      ))}
                      {isRunning ? (
                        <button onClick={stopRunning}
                          className="ml-auto rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                          {runProgress ? `Stop (${runProgress.current}/${runProgress.total})` : 'Stop'}
                        </button>
                      ) : (
                        <button onClick={handleReset}
                          className="ml-auto rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)] transition-colors">
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">Null distribution</div>
                      <p className="text-sm text-[var(--color-muted)]">
                        {simCount === 0 ? 'Do the first repetition by hand, then the distribution will start to grow.' : `${extremeCount} of ${simCount} simulated samples are as or more extreme.`}
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                      {(['proportions', 'counts'] as GraphView[]).map((value, index) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => patchConfig({
                            graphView: value,
                            customThreshold: value === 'counts' ? String(x) : (x / Math.max(1, n)).toFixed(4),
                          })}
                          className={`px-2.5 py-1 font-medium transition-colors ${index > 0 ? 'border-l border-[var(--color-border)]' : ''} ${graphView === value ? 'bg-[var(--color-text)] text-[var(--color-surface)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}
                        >
                          {value === 'proportions' ? 'Proportions' : 'Counts'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 392 }}>
                    {simCount === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                        Start with Randomize → Compute → Plot.
                      </div>
                    ) : (
                      <OnePropNullDistPlot
                        counts={nullDist}
                        xObs={x}
                        n={n}
                        p0Num={p0Num}
                        alternative={alternative}
                        view={graphView}
                        showNormalCurve={showNormalCurve}
                        thresholdVal={Number.isFinite(customThresholdNum)
                          ? (graphView === 'counts' ? customThresholdNum : thresholdOnCountScale / Math.max(1, n))
                          : undefined}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">Observed sample</div>
                  <div className="mt-3 space-y-2 text-sm text-[var(--color-text)]">
                    <div><span className="font-semibold">H₀:</span> p = {nullP}</div>
                    <div><span className="font-semibold">Hₐ:</span> p {altOperator(alternative)} {nullP}</div>
                    <div><span className="font-semibold">Success:</span> {successLabel}</div>
                    <div><span className="font-semibold">n:</span> {n}</div>
                    <div><span className="font-semibold">x:</span> {x}</div>
                    <div><span className="font-semibold"><PHat /></span> {phat?.toFixed(4) ?? '—'}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-muted)]">Conclusion tools</div>
                  <div className="mt-3 space-y-3 text-sm">
                    <label className="flex items-center gap-2 select-none text-[var(--color-text)]">
                      <input
                        type="checkbox"
                        checked={showNormalCurve}
                        onChange={e => patchConfig({ showNormalCurve: e.target.checked })}
                        className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                      />
                      Overlay normal curve
                    </label>
                    {showNormalCurve && (
                      <div className="pl-6 text-[var(--color-muted)]">
                        <div>Mean = {normMean.toFixed(graphView === 'counts' ? 1 : 4)}</div>
                        <div>SD = {normSD.toFixed(graphView === 'counts' ? 1 : 4)}</div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--color-text)]">Editable tail probability</div>
                      <div className="flex flex-wrap items-center gap-1 text-[var(--color-muted)]">
                        <span>{graphView === 'counts' ? 'P(X' : 'P(p̂'}</span>
                        <span>{altOperator(alternative)}</span>
                        <input
                          type="number"
                          value={customThreshold}
                          onChange={e => patchConfig({ customThreshold: e.target.value })}
                          step={graphView === 'counts' ? 1 : 0.01}
                          min={0}
                          max={graphView === 'counts' ? n : 1}
                          className="w-20 rounded-md border border-[var(--color-border)] px-2 py-1 text-center text-[var(--color-text)]"
                        />
                        <span>) =</span>
                        <span className="font-semibold text-[var(--color-accent)]">
                          {customPValue !== null ? (customPValue < 0.001 ? '< 0.001' : customPValue.toFixed(4)) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-[var(--color-accent-light)] px-3 py-3 text-sm">
                      {simCount < 100 ? (
                        <div className="text-[var(--color-muted)]">Too few to trust yet. Build at least 100 repetitions before drawing a conclusion.</div>
                      ) : (
                        <>
                          <div className="font-semibold text-[var(--color-text)]">{extremeCount} of {simCount} as or more extreme</div>
                          <div className="mt-1 text-[var(--color-muted)]">{verdict}</div>
                        </>
                      )}
                    </div>
                    {stage === 'conclude' && (
                      <button
                        type="button"
                        onClick={() => goToStage('simulate')}
                        className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]"
                      >
                        ← Simulate more
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Simulation card ───────────────────────────────────────────────────────────

// Step phase for the manual 3-step sequence
type StepPhase = 'observing' | 'spinning' | 'computed' | 'plotted'

function PHat({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-block leading-none ${className}`}>
      <span>p</span>
      <span
        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[0.34em] text-[0.78em] leading-none"
        aria-hidden="true"
      >
        ^
      </span>
    </span>
  )
}

export function OnePropSimCard({ cardId, config }: { cardId: string; config: OnePropSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const [phase, setPhase]               = useState<StepPhase>('observing')
  const [pendingSim, setPendingSim]     = useState<OnePropResult | null>(null)
  const [displayedSim, setDisplayedSim] = useState<OnePropResult | null>(null)
  const [graphView, setGraphView]       = useState<GraphView>('proportions')
  const [isRunning, setIsRunning]       = useState(false)
  const [runProgress, setRunProgress]   = useState<{ current: number; total: number } | null>(null)
  const cancelRef = useRef(false)

  const { n, x } = config
  const phat        = n > 0 ? x / n : 0
  const p0Num       = parseFloat(config.nullP)
  const nullDist    = config.nullDist
  const simCount    = config.simCount
  const extremeCount = config.extremeCount
  const alternative  = config.alternative
  const showNormalCurve = config.showNormalCurve ?? false

  const pValue = simCount > 0 ? extremeCount / simCount : null

  // ── Custom threshold for p-value query ──
  const [customThreshold, setCustomThreshold] = useState<string>(() =>
    graphView === 'counts' ? String(x) : (x / Math.max(1, n)).toFixed(4)
  )
  // Reset when switching between Counts ↔ Proportions
  useEffect(() => {
    setCustomThreshold(graphView === 'counts' ? String(x) : (x / Math.max(1, n)).toFixed(4))
  }, [graphView]) // eslint-disable-line react-hooks/exhaustive-deps

  const customThresholdNum = parseFloat(customThreshold)
  const thresholdOnCountScale = Number.isFinite(customThresholdNum)
    ? (graphView === 'counts' ? customThresholdNum : snapThresholdCount(customThresholdNum, n))
    : Number.NaN
  const nullCenterCount = n * p0Num

  const customPValue = useMemo(() => {
    if (nullDist.length === 0 || !Number.isFinite(thresholdOnCountScale)) return null
    const dist = Math.abs(thresholdOnCountScale - nullCenterCount)
    const extreme = nullDist.filter(xSim => {
      if (alternative === 'greater') return xSim >= thresholdOnCountScale
      if (alternative === 'less')    return xSim <= thresholdOnCountScale
      return Math.abs(xSim - nullCenterCount) >= dist
    }).length
    return extreme / nullDist.length
  }, [nullDist, thresholdOnCountScale, alternative, nullCenterCount])

  const altSymbol    = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'

  function updateAlternative(next: Alternative) {
    const nextExtremeCount = nullDist.reduce((countExtreme, xSim) => (
      countExtreme + (isExtremeOneProp(xSim, x, n, p0Num, next) ? 1 : 0)
    ), 0)
    updateExploreCard(cardId, {
      config: {
        ...config,
        alternative: next,
        extremeCount: nextExtremeCount,
      }
    })
  }

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
      return displayedSim.outcomes.map(outcome => outcome ? 'heads' as CoinFace : 'tails' as CoinFace)
    }
    return [
      ...Array(x).fill('heads' as CoinFace),
      ...Array(Math.max(0, n - x)).fill('tails' as CoinFace),
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
    cancelRef.current = true
    setIsRunning(false)
    setRunProgress(null)
    setPendingSim(null)
    setDisplayedSim(null)
    setPhase('observing')
    updateExploreCard(cardId, {
      config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 }
    })
  }

  // ── Animated batch (Run 1 / Run 10) ──
  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  async function runAnimated(count: number) {
    if (isRunning || !Number.isFinite(p0Num) || p0Num < 0 || p0Num > 1) return
    cancelRef.current = false
    setIsRunning(true)

    // Timing: slower for 1, snappier for 10
    const spinMs    = count === 1 ? 1200 : 360
    const computeMs = count === 1 ? 450 : 130
    const pauseMs   = count === 1 ? 80  : 40

    // Track accumulating counts locally (config prop is stale in async closure)
    let localNullDist     = [...config.nullDist]
    let localSimCount     = config.simCount
    let localExtremeCount = config.extremeCount

    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break
      setRunProgress({ current: i + 1, total: count })

      // ① Randomize
      const sim = runOnePropRandomization(n, p0Num)
      setPendingSim(sim)
      setPhase('spinning')
      await sleep(spinMs)
      if (cancelRef.current) break

      // ② Compute
      setDisplayedSim(sim)
      setPhase('computed')
      await sleep(computeMs)
      if (cancelRef.current) break

      // ③ Plot
      const extreme = isExtremeOneProp(sim.xSim, x, n, p0Num, alternative) ? 1 : 0
      localNullDist = [...localNullDist, sim.xSim]
      localSimCount++
      localExtremeCount += extreme
      updateExploreCard(cardId, {
        config: {
          ...config,
          nullDist:     localNullDist,
          simCount:     localSimCount,
          extremeCount: localExtremeCount,
        }
      })
      setPendingSim(null)
      setPhase('plotted')

      if (i < count - 1) await sleep(pauseMs)
    }

    setIsRunning(false)
    setRunProgress(null)
    cancelRef.current = false
  }

  function stopRunning() {
    cancelRef.current = true
  }

  // Last displayed sim stats
  const lastSimExtreme = displayedSim
    ? isExtremeOneProp(displayedSim.xSim, x, n, p0Num, alternative)
    : false

  const probabilityLabel = (() => {
    if (alternative === 'two') {
      return 'Two-sided p-value = 2 × smaller tail'
    }
    const symbol = altOperator(alternative)
    if (graphView === 'counts') return `P(X ${symbol} ${x})`
    const observedProp = x / Math.max(1, n)
    const shown = observedProp.toFixed(4).replace(/^0(?=\.)/, '')
    return `P(p̂ ${symbol} ${shown})`
  })()

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

        <div className="space-y-3">
          {/* ── Unified coin panel ── */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex flex-col">

            <div className={`px-3 py-1.5 border-b border-[var(--color-border)] flex items-center gap-2 transition-colors duration-300 ${
              phase === 'spinning' ? 'bg-[var(--color-accent-light)]' :
              phase === 'computed' ? 'bg-[var(--color-accent-light)]'  :
              'bg-[var(--color-accent-light)]'
            }`}>
              {phase === 'spinning' && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {phase === 'computed' && (
                <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
              )}
              {(phase === 'observing' || phase === 'plotted') && (
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-border)]" />
              )}
              <span className="text-xs font-medium text-[var(--color-text)]">{statusLabel}</span>
            </div>

            <div
              className="flex flex-wrap content-start overflow-hidden px-3 pt-3 pb-2"
              style={{
                gap: coinGap,
                alignContent: 'flex-start',
                minHeight: panelH,
                maxHeight: panelH,
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
          </div>

          {/* ── Slim summary row ── */}
        </div>

        {/* ── Null distribution ── */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex flex-col gap-1.5">
          <div className="flex gap-4 items-stretch">
            <div className="w-44 flex-shrink-0 flex flex-col gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              <div className="flex flex-col items-start gap-2">
                <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-[10px]">
                  {(['proportions', 'counts'] as GraphView[]).map((v, i) => (
                    <button key={v} onClick={() => setGraphView(v)}
                      className={`px-2 py-0.5 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${graphView === v ? 'bg-[var(--color-text)] text-[var(--color-surface)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}>
                      {v === 'proportions' ? 'Sample Proportions' : 'Counts'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col items-start text-[14px] leading-[1.4] text-[var(--color-muted)]">
                  <label className="flex items-center gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={showNormalCurve}
                      onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                    />
                    Overlay normal curve
                  </label>
                  {showNormalCurve && (
                    <div className="pl-6 pt-1 leading-[1.4] text-[14px]">
                      <div>Mean = {normMean.toFixed(graphView === 'counts' ? 1 : 4)}</div>
                      <div>SD = {normSD.toFixed(graphView === 'counts' ? 1 : 4)}</div>
                    </div>
                  )}
                  <div className="pt-2 space-y-1 text-[14px] leading-[1.4]">
                    <div><span className="font-semibold text-[var(--color-text)]">H₀:</span> p = {config.nullP}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-text)]">Hₐ:</span>
                      <span className="font-medium text-[var(--color-text)]">p</span>
                      <select
                        value={alternative}
                        onChange={e => updateAlternative(e.target.value as Alternative)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[14px] font-medium text-[var(--color-text)]"
                      >
                        <option value="less">&lt;</option>
                        <option value="greater">&gt;</option>
                        <option value="two">≠</option>
                      </select>
                      <span className="font-medium text-[var(--color-text)]">{config.nullP}</span>
                    </div>
                    <div><span className="font-semibold text-[var(--color-text)]">n:</span> {n}</div>
                    <div><span className="font-semibold text-[var(--color-text)]">p̂:</span> <span className="font-bold text-[var(--color-accent)]">{phat.toFixed(4)}</span></div>
                  </div>
                  <div className="pt-2 space-y-1 leading-[1.4] text-[14px]">
                    <div>
                      <span className="font-semibold text-[var(--color-text)]">As or more extreme:</span>{' '}
                      <span className="font-bold text-[var(--color-text)]">{extremeCount}</span> / {simCount}
                    </div>
                    {/* Editable p-value threshold */}
                    <div className="flex items-baseline gap-0.5 flex-wrap text-[14px]">
                      {alternative === 'two' ? (
                        <>
                          <span>
                            {graphView === 'counts'
                              ? 'P(X as or more extreme than'
                              : 'P(p̂ as or more extreme than'}
                          </span>
                          <input
                            type="number"
                            value={customThreshold}
                            onChange={e => setCustomThreshold(e.target.value)}
                            step={graphView === 'counts' ? 1 : 0.01}
                            min={graphView === 'counts' ? 0 : 0}
                            max={graphView === 'counts' ? n : 1}
                            className="w-16 text-center text-[var(--color-accent)] font-semibold bg-transparent border-b border-[var(--color-accent)] focus:outline-none text-[14px] [appearance:textfield] mx-0.5"
                          />
                          <span>)</span>
                        </>
                      ) : (
                        <>
                          <span>P({graphView === 'counts' ? 'X' : 'p̂'} {altOperator(alternative)}</span>
                          <input
                            type="number"
                            value={customThreshold}
                            onChange={e => setCustomThreshold(e.target.value)}
                            step={graphView === 'counts' ? 1 : 0.01}
                            min={graphView === 'counts' ? 0 : 0}
                            max={graphView === 'counts' ? n : 1}
                            className="w-16 text-center text-[var(--color-accent)] font-semibold bg-transparent border-b border-[var(--color-accent)] focus:outline-none text-[14px] [appearance:textfield] mx-0.5"
                          />
                          <span>)</span>
                        </>
                      )}
                      <span>=</span>
                      <span className="ml-0.5 font-semibold text-[var(--color-accent)]">
                        {customPValue !== null
                          ? customPValue < 0.001 ? '< 0.001' : customPValue.toFixed(4)
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="min-h-0" style={{ height: 392 }}>
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
                      thresholdVal={Number.isFinite(customThresholdNum)
                        ? (graphView === 'counts' ? customThresholdNum : thresholdOnCountScale / Math.max(1, n))
                        : undefined}
                    />
                }
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-accent-light)]">
        <button
          onClick={handleRandomize}
          disabled={isRunning || phase === 'spinning' || phase === 'computed'}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !isRunning && (phase === 'observing' || phase === 'plotted')
              ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
              : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
          }`}
        >
          1. Randomize
        </button>
        <button
          onClick={handleCompute}
          disabled={isRunning || phase !== 'spinning'}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !isRunning && phase === 'spinning'
              ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
              : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
          }`}
        >
          2. Compute
        </button>
        <button
          onClick={handlePlot}
          disabled={isRunning || phase !== 'computed'}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !isRunning && phase === 'computed'
              ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
              : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
          }`}
        >
          3. Plot
        </button>

        <span className="text-[var(--color-border)]">|</span>
        <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">Batch</span>

        {/* Run 1 and Run 10 — animated step-by-step */}
        {([1, 10] as const).map(cnt => (
          <button key={cnt} onClick={() => runAnimated(cnt)} disabled={isRunning}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              isRunning
                ? 'border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                : 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)]'
            }`}>
            Run {cnt}
          </button>
        ))}

        {/* Run 100 and Run 1,000 — instant */}
        {([100, 1000] as const).map(cnt => (
          <button key={cnt} onClick={() => runBatch(cnt)} disabled={isRunning}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              isRunning
                ? 'border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                : 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)]'
            }`}>
            Run {cnt.toLocaleString()}
          </button>
        ))}

        {isRunning ? (
          <button onClick={stopRunning}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors ml-auto">
            {runProgress ? `Stop (${runProgress.current}/${runProgress.total})` : 'Stop'}
          </button>
        ) : (
          <button onClick={handleReset}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)] transition-colors ml-auto">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
