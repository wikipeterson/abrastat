'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { FloatingTooltip } from './_shared'
import { DropZone } from '@/components/explore/DropZone'
import { OnePropRandomizationCardConfig } from '@/lib/exploreTypes'
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
  // Coin size in px; shrinks as n grows. perRow uses ~1040px (tray width on 1380px card).
  const size =
    n <=  12 ? 60 :
    n <=  20 ? 52 :
    n <=  35 ? 44 :
    n <=  55 ? 36 :
    n <=  90 ? 28 :
    n <= 160 ? 20 :
               15
  const gap     = Math.max(4, Math.round(size * 0.10))
  const perRow  = Math.max(1, Math.floor(1040 / (size + gap)))
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

function tailOperator(alternative: Alternative): string {
  if (alternative === 'less') return '≤'
  if (alternative === 'greater') return '≥'
  return '≠'
}

function formatTailThreshold(value: number, graphView: GraphView, n: number): string {
  if (!Number.isFinite(value)) return '—'
  if (graphView === 'counts') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
  return (value / Math.max(1, n)).toFixed(4)
}

function snapThresholdCount(threshold: number, n: number): number {
  const scaled = threshold * n
  const nearest = Math.round(scaled)
  return Math.abs(scaled - nearest) <= 0.01 ? nearest : scaled
}

function OnePropNullDistPlot({
  counts, xObs, n, p0Num, alternative, view, showNormalCurve = false, thresholdVal, forceHistogram = false,
}: {
  counts: number[]
  xObs: number
  n: number
  p0Num: number
  alternative: Alternative
  view: GraphView
  showNormalCurve?: boolean
  thresholdVal?: number
  forceHistogram?: boolean
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 42, l: 16 }
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

  // Use custom threshold for shading/coloring if provided and valid
  const thresh = (thresholdVal !== undefined && Number.isFinite(thresholdVal)) ? thresholdVal : obsVal
  const showHistogram = forceHistogram || values.length >= 250

  // Compute histogram bars before yScale so we can derive the correct y-axis max (4o fix)
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

  const maxHistCount = histogramBars.length > 0 ? Math.max(...histogramBars.map(b => b.count)) : 0
  const maxDisplayMax = showHistogram ? maxHistCount : maxStack

  const histBinWidth = showHistogram
    ? xRange / Math.min(28, Math.max(10, Math.round(Math.sqrt(values.length))))
    : bucket

  const normalStats = (() => {
    if (!showNormalCurve || values.length < 2 || normSD <= 0) return null
    const samples = Array.from({ length: 241 }, (_, i) => {
      const x = xLo + (i / 240) * xRange
      const z = (x - nullCenter) / normSD
      const pdf = Math.exp(-0.5 * z * z) / (normSD * Math.sqrt(2 * Math.PI))
      return { x, expectedCount: values.length * pdf * histBinWidth }
    })
    return { samples }
  })()

  const maxCurveCountRaw = normalStats ? Math.max(...normalStats.samples.map(s => s.expectedCount)) : 0
  const maxCurveCount = Math.min(maxCurveCountRaw, Math.max(maxDisplayMax * 1.35, 1))
  const topPad = 10
  const yMaxCount = Math.max(maxDisplayMax, maxCurveCount) * 1.12
  const yScale = (PH - topPad) / Math.max(1, yMaxCount)

  const seenC = new Map<number, number>()
  const dotStep = Math.min(20, PH / Math.max(1, maxStack))
  const dotR = Math.max(4.5, dotStep / 2 - 0.8)
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
        {/* Light shaded extreme region — observed/focus = gold */}
        <path d={shade} fill="var(--color-gold)" opacity={0.10} />
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="var(--color-text)" strokeWidth={1.5} />
        {ticks.map((v, i) => (
          <g key={i} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="var(--color-muted)" strokeWidth={1} />
            <text y={18} textAnchor="middle" fontSize={tickFontSize} fill="var(--color-muted)" fontFamily="DM Sans,sans-serif">
              {view === 'counts' ? Math.round(v).toString() : formatTick(v, xRange)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {/* Normal curve extreme-region fill — model overlay = accent */}
          {normalFillPath && (
            <path d={normalFillPath} fill="var(--color-accent)" opacity={0.28} />
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
                    fill={bar.extreme ? 'var(--color-gold)' : 'var(--color-accent)'}
                    opacity={0.82}
                  />
                )
              })
            : circles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={dotR}
                  fill={c.extreme ? 'var(--color-gold)' : 'var(--color-accent)'} opacity={0.85}
                  stroke="white" strokeWidth={0.8}
                  style={i === circles.length - 1 && values.length > 0
                    ? { animation: 'dot-drop-full 700ms ease-out' } : undefined}
                />
              ))}
          {/* Normal curve — model overlay = accent */}
          {normalPath && (
            <polyline points={normalPath} fill="none" stroke="var(--color-accent)" strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          )}
        </g>
        {/* Obs line — observed = gold */}
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="var(--color-gold)" strokeWidth={1.8} strokeDasharray="4,3" />
        <text x={obsX + (obsVal >= nullCenter ? 3 : -3)} y={7}
          textAnchor={obsVal >= nullCenter ? 'start' : 'end'}
          fontSize={markerFontSize} fill="var(--color-gold-text)" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        {/* Custom threshold line — accent (model/theoretical), only when differs from obs */}
        {showThreshLine && (
          <>
            <line x1={threshX} y1={0} x2={threshX} y2={PH}
              stroke="var(--color-accent)" strokeWidth={1.6} strokeDasharray="5,3" />
            <text x={threshX + (thresh >= nullCenter ? 3 : -3)} y={16}
              textAnchor={thresh >= nullCenter ? 'start' : 'end'}
              fontSize={markerFontSize} fill="var(--color-accent-strong)" fontFamily="DM Sans,sans-serif" fontWeight="600">t</text>
          </>
        )}
        <text x={PW / 2} y={PH + 30} textAnchor="middle" fontSize={axisLabelFontSize} fill="var(--color-muted)" fontFamily="DM Sans,sans-serif">
          {view === 'counts' ? 'Simulated X (count of successes)' : 'Simulated p̂'}
        </text>
      </g>
    </svg>
  )
}

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
    ? { width: 820, height: 640 }
    : { width: 1380, height: 760 }

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
      if (!Number.isFinite(xVal) || !Number.isFinite(nVal)) return { n: 0, x: 0, phat: null, error: null as string | null }
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

  function handleClear() {
    cancelRef.current = true
    setIsRunning(false)
    setRunProgress(null)
    setPendingSim(null)
    setDisplayedSim(null)
    setPhase('observing')
    patchConfig({ nullDist: [], simCount: 0, extremeCount: 0 })
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
  const panelH = Math.max(80, Math.min(coinRows * (coinSize + coinGap) + 20, 300))
  const hasEnoughToConclude = simCount >= 100

  const firstRunGuidance = ((): React.ReactNode => {
    if (simCount > 0) return null
    if (phase === 'spinning') return (
      <span>{n} coins flipped. Now <strong className="font-semibold text-[var(--color-text)]">count</strong> the <strong className="font-semibold text-[var(--color-text)]">heads</strong>.</span>
    )
    if (phase === 'computed' && displayedSim) return (
      <span>{displayedSim.xSim} heads → p̂* = <strong className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{displayedSim.pSim.toFixed(3)}</strong>. Plot drops it on the distribution.</span>
    )
    return null
  })()

  const coinTrayVisible = (phase === 'spinning' || phase === 'computed') && !isRunning
  const microCopy: React.ReactNode = isRunning && runProgress
    ? `Running ${runProgress.current} of ${runProgress.total}…`
    : firstRunGuidance

  const pValueTooltip = useMemo((): string => {
    if (pValue === null || simCount < 100 || phat === null || !p0Valid) return ''
    const pStr = pValue < 0.001 ? '< 0.001' : `= ${pValue.toFixed(3)}`
    const dist = Math.abs(phat - p0Num)
    if (graphView === 'counts') {
      const xDist = Math.round(Math.abs(x - n * p0Num))
      const lo = Math.round(n * p0Num - xDist)
      const hi = Math.round(n * p0Num + xDist)
      if (alternative === 'greater') return `P(X* ≥ ${x}) under H₀ ${pStr}`
      if (alternative === 'less') return `P(X* ≤ ${x}) under H₀ ${pStr}`
      return `P(X* ≤ ${lo} or X* ≥ ${hi}) under H₀ ${pStr}`
    }
    if (alternative === 'greater') return `P(p̂* ≥ ${phat.toFixed(3)}) under H₀ ${pStr}`
    if (alternative === 'less') return `P(p̂* ≤ ${phat.toFixed(3)}) under H₀ ${pStr}`
    const lower = (p0Num - dist).toFixed(3)
    const upper = (p0Num + dist).toFixed(3)
    return `P(p̂* ≤ ${lower} or p̂* ≥ ${upper}) under H₀ ${pStr}`
  }, [alternative, graphView, n, p0Num, p0Valid, pValue, phat, simCount, x])

  const interpretationText = useMemo((): string => {
    if (simCount < 100 || pValue === null) return ''
    const word = pValue > 0.10 ? 'common'
      : pValue > 0.05 ? 'somewhat unusual'
      : pValue > 0.01 ? 'unusual'
      : pValue > 0.001 ? 'very rare'
      : 'extremely rare'
    return `Based on the simulation, a result like this is ${word} when the true proportion is ${nullP}.`
  }, [nullP, pValue, simCount])

  const statusLabel = (() => {
    if (phase === 'observing') return `Observed sample — n = ${n}, X = ${x}`
    if (phase === 'spinning') return 'Simulating under H₀ …'
    if (phase === 'computed') return `Simulation result — X = ${displayedSim?.xSim ?? '?'}, p̂* = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
    return `Last result — X = ${displayedSim?.xSim ?? '?'}, p̂* = ${displayedSim ? displayedSim.pSim.toFixed(3) : '?'}`
  })()

  const stepLabels = [
    { key: 'setup' as const, label: 'Set up', enabled: true },
    { key: 'simulate' as const, label: 'Simulate', enabled: true },
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
                      : 'bg-[var(--color-border)] text-[var(--color-muted)] opacity-50'
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
                      : 'text-[var(--color-muted)] opacity-40'
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
      <div className="space-y-4 px-2 py-1">
        {stepper}

        <div className="text-sm font-serif italic leading-snug text-[var(--color-text)]">
          If the null hypothesis were true, would results like ours be unlikely?
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3.5 space-y-3">
          {/* Source toggle */}
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">Source</span>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden text-xs">
              {(['data', 'manual'] as const).map((m, i) => (
                <button
                  key={m}
                  onClick={() => patchConfig({ sourceMode: m })}
                  className={`px-3 py-1.5 font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${sourceMode === m ? 'bg-[var(--color-accent-strong)] text-white' : 'text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}
                >
                  {m === 'data' ? 'Use data' : 'Enter info'}
                </button>
              ))}
            </div>
          </div>

          {/* Hypotheses bar */}
          <div className="flex items-center gap-5 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-semibold text-[var(--color-text)] whitespace-nowrap">H<sub>0</sub> : p =</span>
              <input
                type="number" min={0} max={1} step={0.01} value={nullP}
                onChange={e => patchConfig({ nullP: e.target.value })}
                className="w-20 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center font-mono text-[15px] font-semibold text-[var(--color-text)] shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-semibold text-[var(--color-muted)] whitespace-nowrap">H<sub>a</sub> : p</span>
              <select
                value={alternative}
                onChange={e => updateAlternative(e.target.value as Alternative)}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-[15px] font-semibold text-[var(--color-text)] shadow-sm"
              >
                <option value="less">&lt;</option>
                <option value="two">≠</option>
                <option value="greater">&gt;</option>
              </select>
              <span className="font-mono text-[15px] font-semibold text-[var(--color-muted)] tabular-nums">{nullP}</span>
            </div>
          </div>

          {/* Observed data */}
          {sourceMode === 'data' ? (
            <div className="space-y-2">
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
                  <span className="text-sm text-[var(--color-muted)]">Success</span>
                  <select
                    value={successLevel}
                    onChange={e => patchConfig({ successLevel: e.target.value })}
                    className="min-w-[200px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-text)]"
                  >
                    {catLevels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <span className="text-sm text-[var(--color-muted)]">
                    observed <PHat /> = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{phat !== null ? phat.toFixed(3) : '—'}</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
              <input
                type="number" min={0} step={1} value={manualX}
                onChange={e => patchConfig({ manualX: e.target.value })}
                className="w-20 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center font-mono text-[15px] font-semibold text-[var(--color-text)]"
              />
              <span>successes out of</span>
              <input
                type="number" min={1} step={1} value={manualN}
                onChange={e => patchConfig({ manualN: e.target.value })}
                className="w-20 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center font-mono text-[15px] font-semibold text-[var(--color-text)]"
              />
              <span>trials</span>
              <span>observed <PHat /> = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{phat !== null ? phat.toFixed(3) : '—'}</span></span>
            </div>
          )}

          {error && <div className="text-sm text-rose-500">{error}</div>}
        </div>

        <button
          onClick={handleStartSimulating}
          disabled={!canStartSimulating}
          className="rounded-[18px] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start simulating →
        </button>
      </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <style>{COIN_CSS}</style>
      {stage === 'setup' && (
        <div className="h-full overflow-y-auto pr-1">
          {setupCard}
        </div>
      )}

      {stage !== 'setup' && (
        <div className="flex h-full min-h-0 flex-col">

          {/* ── Row 1: stepper + Edit setup ── */}
          <div className="flex-shrink-0 flex items-center gap-4 pb-3 border-b border-[var(--color-border)]">
            <div className="flex-1 min-w-0">{stepper}</div>
            <button
              type="button"
              onClick={() => goToStage('setup')}
              className="flex-shrink-0 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]"
            >
              ← Edit setup
            </button>
          </div>

          {/* ── Row 2: Observed strip ── */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 py-2.5">
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              H₀: p = <span className="font-mono tabular-nums font-semibold">{nullP}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              Hₐ: p <span className="px-0.5 font-semibold">{altOperator(alternative)}</span> <span className="font-mono tabular-nums font-semibold">{nullP}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              Trials n = <span className="font-mono tabular-nums font-semibold">{n}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              Successes X = <span className="font-mono tabular-nums font-semibold">{x}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              Observed <PHat className="mx-0.5" /> = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{phat?.toFixed(3) ?? '—'}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]">
              Repetitions = <span className="font-mono tabular-nums font-semibold">{simCount.toLocaleString()}</span>
            </div>
          </div>

          {/* ── Row 3: Action bar — 1→2→3 · micro-copy · speed up ── */}
          <div className="flex-shrink-0 flex items-center gap-2 py-2 border-t border-b border-[var(--color-border)]">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRandomize}
                disabled={isRunning || phase === 'spinning' || phase === 'computed'}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  !isRunning && (phase === 'observing' || phase === 'plotted')
                    ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                    : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                }`}
              >
                1. Randomize
              </button>
              <span className="text-[var(--color-border)] text-sm">→</span>
              <button
                onClick={handleCompute}
                disabled={isRunning || phase !== 'spinning'}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  !isRunning && phase === 'spinning'
                    ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                    : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                }`}
              >
                2. Compute
              </button>
              <span className="text-[var(--color-border)] text-sm">→</span>
              <button
                onClick={handlePlot}
                disabled={isRunning || phase !== 'computed'}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  !isRunning && phase === 'computed'
                    ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                    : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed'
                }`}
              >
                3. Plot
              </button>
            </div>

            <div className="flex-1 min-w-0 px-2">
              {simCount >= 1 && phase === 'plotted' && !isRunning ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Another? <strong className="font-semibold text-[var(--color-text)]">Randomize</strong> again — or speed up with +10 / +100 / +1,000.
                </p>
              ) : microCopy ? (
                <p className="text-sm text-[var(--color-muted)] truncate">{microCopy}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-[0.1em]">Speed up</span>
              {simCount > 0 && ([10, 100, 1000] as const).map(cnt => (
                <button
                  key={cnt}
                  onClick={() => cnt === 10 ? runAnimated(cnt) : runBatch(cnt)}
                  disabled={isRunning}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isRunning
                      ? 'border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed opacity-50'
                      : 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)]'
                  }`}
                >
                  +{cnt.toLocaleString()}
                </button>
              ))}
              {isRunning ? (
                <button
                  onClick={stopRunning}
                  className="rounded-lg border border-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                >
                  {runProgress ? `Stop (${runProgress.current}/${runProgress.total})` : 'Stop'}
                </button>
              ) : simCount > 0 ? (
                <button
                  onClick={handleClear}
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)] transition-colors"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* ── Eyebrow: null distribution label ── */}
          <div className="flex-shrink-0 pt-2 pb-0.5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Null distribution — {simCount.toLocaleString()} repetition{simCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* ── Row 4: Main area — plot (flex) + conclusion tools (fixed 250px) ── */}
          <div className="flex-1 min-h-0 flex gap-4">

            {/* Null distribution plot with transient coin overlay */}
            <div className="relative flex-1 min-w-0 min-h-0">
              {simCount === 0 && !coinTrayVisible ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                  Click <strong className="mx-1 font-semibold text-[var(--color-text)]">1. Randomize</strong> above to start.
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
                  forceHistogram={stage === 'conclude'}
                />
              )}

              {/* Transient coin tray — slides up over the plot during hand repetitions */}
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden px-6 py-5 transition-all duration-300 ease-in-out ${
                  coinTrayVisible
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-full opacity-0 pointer-events-none'
                }`}
              >
                {/* Title */}
                {phase === 'spinning' && (
                  <p className="font-serif italic text-xl text-[var(--color-text)] text-center">
                    Flipping {n} coins under H₀…
                  </p>
                )}
                {phase === 'computed' && displayedSim && (
                  <p className="text-xl text-center">
                    <span className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{displayedSim.xSim} heads</span>
                    <span className="font-sans text-[var(--color-text)]"> of {n}</span>
                  </p>
                )}

                {/* Coins */}
                <div
                  className="flex flex-wrap justify-center"
                  style={{ gap: coinGap, maxWidth: '100%' }}
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

                {/* Formula */}
                {phase === 'computed' && displayedSim && (
                  <p className="text-sm text-[var(--color-text)] text-center">
                    <PHat className="inline" />* = {displayedSim.xSim}/{n} ={' '}
                    <span className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{displayedSim.pSim.toFixed(3)}</span>
                    {' '}— one simulated sample
                  </p>
                )}

                {/* CTA button */}
                <button
                  onClick={phase === 'spinning' ? handleCompute : handlePlot}
                  className="rounded-xl bg-[var(--color-accent)] px-8 py-2.5 text-sm font-semibold text-white hover:brightness-105 transition-colors"
                >
                  {phase === 'spinning' ? '2. Compute →' : '3. Plot it →'}
                </button>
              </div>
            </div>

            {/* Conclusion panel — calm 3-element readout */}
            <div className="w-[250px] flex-shrink-0 flex flex-col gap-4">

              {/* Proportions / Counts toggle */}
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                {(['proportions', 'counts'] as GraphView[]).map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patchConfig({ graphView: value })}
                    className={`flex-1 px-2.5 py-1.5 font-medium transition-colors ${index > 0 ? 'border-l border-[var(--color-border)]' : ''} ${graphView === value ? 'bg-[var(--color-text)] text-[var(--color-surface)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}
                  >
                    {value === 'proportions' ? 'Proportions' : 'Counts'}
                  </button>
                ))}
              </div>

              {/* 1. Normal curve checkbox — mean/SD in hover tooltip */}
              <label className="flex items-center gap-2 select-none text-sm text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={showNormalCurve}
                  onChange={e => patchConfig({ showNormalCurve: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
                <FloatingTooltip content={`Normal approximation of the null distribution · mean = ${normMean.toFixed(graphView === 'counts' ? 2 : 3)} · SD = ${normSD.toFixed(3)}`}>
                  <span className="underline decoration-dotted underline-offset-2 cursor-help">Overlay normal curve</span>
                </FloatingTooltip>
              </label>

              {/* 2. p-value headline in gold — probability statement on hover */}
              <div>
                <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] mb-1.5">p-value</div>
                <FloatingTooltip content={pValueTooltip}>
                  <div className={`inline-block font-mono tabular-nums font-bold text-[var(--color-gold)] ${pValueTooltip ? 'cursor-help' : ''}`} style={{ fontSize: '1.75rem', lineHeight: 1.1 }}>
                    {simCount < 100 || pValue === null
                      ? '—'
                      : pValue < 0.001 ? '< 0.001' : pValue.toFixed(3)
                    }
                  </div>
                </FloatingTooltip>
              </div>

              {/* 3. Factual readout — hover reveals interpretation */}
              {simCount < 100
                ? <p className="text-sm text-[var(--color-text)] leading-relaxed">
                    Build at least <strong className="font-mono font-bold">100</strong> repetitions to read a p-value.
                  </p>
                : <FloatingTooltip content={interpretationText}>
                    <p className="text-sm text-[var(--color-text)] leading-relaxed cursor-default">
                      <strong className="font-mono font-bold">{extremeCount.toLocaleString()}</strong>{' '}of the{' '}
                      <strong className="font-mono font-bold">{simCount.toLocaleString()}</strong>{' '}
                      simulated results were as or more extreme than the observed result.
                    </p>
                  </FloatingTooltip>
              }

              {stage === 'conclude' && (
                <button
                  type="button"
                  onClick={() => goToStage('simulate')}
                  className="mt-auto rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]"
                >
                  ← Simulate more
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
