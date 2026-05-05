'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { SimulationCardConfig } from '@/lib/exploreTypes'

function longestStreak(flips: number[]): number {
  if (flips.length === 0) return 0
  let maxRun = 1, run = 1
  for (let i = 1; i < flips.length; i++) {
    if (flips[i] === flips[i - 1]) { run++; if (run > maxRun) maxRun = run }
    else run = 1
  }
  return maxRun
}

function countSwitches(flips: number[]): number {
  let n = 0
  for (let i = 1; i < flips.length; i++) if (flips[i] !== flips[i - 1]) n++
  return n
}

function simStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]
  return { min: sorted[0], max: sorted[n - 1], mean, median }
}

function DotPlotSVG({
  values,
  label,
  xMin,
  xMax,
  color,
}: {
  values: number[]
  label: string
  xMin: number
  xMax: number
  color: string
}) {
  const marginL = 44, marginR = 20, marginT = 16, marginB = 36
  const svgW = 560
  const svgH = 260
  const plotW = svgW - marginL - marginR

  // Frequency map
  const counts: Record<number, number> = {}
  for (const v of values) counts[v] = (counts[v] || 0) + 1
  const maxStack = Math.max(...Object.values(counts), 1)
  const plotH = svgH - marginT - marginB
  const stackStep = Math.min(13, plotH / maxStack)
  const r = Math.max(2, Math.min(5, stackStep / 2 - 0.35))

  const range = xMax > xMin ? xMax - xMin : 1
  const xScale = (v: number) => marginL + ((v - xMin) / range) * plotW
  const yBase = marginT + plotH

  // Dots
  const dots: { cx: number; cy: number; v: number }[] = []
  for (const [vStr, count] of Object.entries(counts)) {
    const v = Number(vStr)
    const cx = xScale(v)
    for (let i = 0; i < count; i++) {
      dots.push({ cx, cy: yBase - r - i * stackStep, v })
    }
  }

  // X axis ticks — aim for ~8 evenly spaced
  const tickCount = Math.min(xMax - xMin + 1, 9)
  const tickStep = Math.max(1, Math.round((xMax - xMin) / (tickCount - 1)))
  const ticks: number[] = []
  for (let t = xMin; t <= xMax; t += tickStep) ticks.push(t)
  if (ticks[ticks.length - 1] !== xMax) ticks.push(xMax)

  const { min, max, mean, median } = simStats(values)
  const meanX = xScale(mean)

  return (
    <div>
      <div className="text-sm font-semibold text-[var(--color-text)] mb-1">{label}</div>
      <div>
        <svg
          width="100%"
          height="auto"
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {/* Mean line */}
          <line
            x1={meanX} y1={marginT}
            x2={meanX} y2={yBase}
            stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
          />

          {/* Dots */}
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={r} fill={color} opacity={0.82}>
              <title>{d.v}</title>
            </circle>
          ))}

          {/* X axis line */}
          <line
            x1={marginL} y1={yBase + 1}
            x2={marginL + plotW} y2={yBase + 1}
            stroke="#CBD5E1" strokeWidth={1}
          />

          {/* Ticks + labels */}
          {ticks.map(t => (
            <g key={t}>
              <line
                x1={xScale(t)} y1={yBase + 1}
                x2={xScale(t)} y2={yBase + 6}
                stroke="#94A3B8" strokeWidth={1}
              />
              <text
                x={xScale(t)} y={yBase + 18}
                textAnchor="middle"
                fontSize={11}
                fill="#64748B"
              >{t}</text>
            </g>
          ))}

          {/* Mean label */}
          <text
            x={meanX} y={marginT - 4}
            textAnchor="middle"
            fontSize={10}
            fill="#F59E0B"
            fontWeight={600}
          >mean</text>
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-muted)]">
        <span>Min: <span className="font-semibold text-[var(--color-text)]">{min}</span></span>
        <span>Mean: <span className="font-semibold text-[var(--color-text)]">{mean.toFixed(2)}</span></span>
        <span>Median: <span className="font-semibold text-[var(--color-text)]">{median}</span></span>
        <span>Max: <span className="font-semibold text-[var(--color-text)]">{max}</span></span>
      </div>
    </div>
  )
}

function ConvergencePlotSVG({
  simFlips,
  probabilityHeads,
}: {
  simFlips: number[][]
  probabilityHeads: number
}) {
  const n = simFlips[0]?.length ?? 0
  if (n === 0 || simFlips.length === 0) return null

  const marginL = 44, marginR = 64, marginT = 20, marginB = 36
  const svgW = 560
  const svgH = 240
  const plotW = svgW - marginL - marginR
  const plotH = svgH - marginT - marginB

  // Downsample x-axis to at most 400 points so SVG stays fast
  const step = Math.max(1, Math.ceil(n / 400))
  const indices: number[] = []
  for (let i = 0; i < n; i += step) indices.push(i)
  if (indices[indices.length - 1] !== n - 1) indices.push(n - 1)

  const xScale = (i: number) => marginL + (i / (n - 1 || 1)) * plotW
  const yScale = (p: number) => marginT + plotH * (1 - p)

  // Running proportions for each sim, sampled at `indices`
  const runningProps: number[][] = simFlips.map(flips => {
    let heads = 0
    let si = 0
    const sampled: number[] = new Array(indices.length)
    for (let i = 0; i < n; i++) {
      heads += flips[i]
      if (si < indices.length && indices[si] === i) {
        sampled[si] = heads / (i + 1)
        si++
      }
    }
    return sampled
  })

  // Mean proportion at each sampled position
  const meanProps: number[] = indices.map((_, si) =>
    runningProps.reduce((sum, props) => sum + props[si], 0) / simFlips.length
  )

  // SVG path strings
  const allPaths = runningProps.map(props =>
    props.map((p, si) =>
      `${si === 0 ? 'M' : 'L'}${xScale(indices[si]).toFixed(1)},${yScale(p).toFixed(1)}`
    ).join(' ')
  )
  const meanPathD = meanProps.map((p, si) =>
    `${si === 0 ? 'M' : 'L'}${xScale(indices[si]).toFixed(1)},${yScale(p).toFixed(1)}`
  ).join(' ')

  const lineOpacity =
    simFlips.length <= 5  ? 0.55 :
    simFlips.length <= 15 ? 0.40 :
    simFlips.length <= 40 ? 0.25 :
    simFlips.length <= 100 ? 0.16 : 0.10

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0]
  const xTickVals = n <= 10
    ? Array.from({ length: n }, (_, i) => i + 1)
    : [1, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n]

  const pRefY = yScale(probabilityHeads)

  return (
    <div>
      <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
        Cumulative Proportion of Heads (by Flip #)
      </div>
      <div>
        <svg
          width="100%"
          height="auto"
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {/* Horizontal grid lines */}
          {yTicks.map(p => (
            <line key={p}
              x1={marginL} y1={yScale(p)}
              x2={marginL + plotW} y2={yScale(p)}
              stroke={p === 0.5 ? '#CBD5E1' : '#E2E8F0'} strokeWidth={1}
            />
          ))}

          {/* p(Heads) reference line */}
          <line
            x1={marginL} y1={pRefY}
            x2={marginL + plotW} y2={pRefY}
            stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="5 3"
          />
          <text
            x={marginL + plotW + 6} y={pRefY + 4}
            fontSize={10} fill="#F59E0B" fontWeight={600}
          >p={probabilityHeads.toFixed(2)}</text>

          {/* Individual simulation lines */}
          {allPaths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#64748B" strokeWidth={1} opacity={lineOpacity} />
          ))}

          {/* Mean line */}
          <path d={meanPathD} fill="none" stroke="#0EA5A0" strokeWidth={2.5} />

          {/* Axes */}
          <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH + 1} stroke="#CBD5E1" strokeWidth={1} />
          <line x1={marginL} y1={marginT + plotH + 1} x2={marginL + plotW} y2={marginT + plotH + 1} stroke="#CBD5E1" strokeWidth={1} />

          {/* Y ticks */}
          {yTicks.map(p => (
            <g key={p}>
              <line x1={marginL - 4} y1={yScale(p)} x2={marginL} y2={yScale(p)} stroke="#94A3B8" strokeWidth={1} />
              <text x={marginL - 7} y={yScale(p) + 4} textAnchor="end" fontSize={10} fill="#64748B">
                {p === 1 ? '1' : p === 0 ? '0' : p.toFixed(2)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTickVals.map(t => {
            const x = xScale(t - 1)
            return (
              <g key={t}>
                <line x1={x} y1={marginT + plotH + 1} x2={x} y2={marginT + plotH + 6} stroke="#94A3B8" strokeWidth={1} />
                <text x={x} y={marginT + plotH + 18} textAnchor="middle" fontSize={11} fill="#64748B">{t}</text>
              </g>
            )
          })}

          {/* Legend */}
          <line x1={marginL + plotW - 80} y1={marginT + 8} x2={marginL + plotW - 60} y2={marginT + 8} stroke="#0EA5A0" strokeWidth={2.5} />
          <text x={marginL + plotW - 56} y={marginT + 12} fontSize={10} fill="#0EA5A0">mean</text>
          <line x1={marginL + plotW - 80} y1={marginT + 22} x2={marginL + plotW - 60} y2={marginT + 22} stroke="#64748B" strokeWidth={1} opacity={0.5} />
          <text x={marginL + plotW - 56} y={marginT + 26} fontSize={10} fill="#64748B">each sim</text>
        </svg>
      </div>
    </div>
  )
}

function GapPlotSVG({
  simFlips,
  probabilityHeads,
}: {
  simFlips: number[][]
  probabilityHeads: number
}) {
  const n = simFlips[0]?.length ?? 0
  if (n === 0 || simFlips.length === 0) return null

  const marginL = 52, marginR = 20, marginT = 20, marginB = 36
  const svgW = 560
  const svgH = 240
  const plotW = svgW - marginL - marginR
  const plotH = svgH - marginT - marginB

  const step = Math.max(1, Math.ceil(n / 400))
  const indices: number[] = []
  for (let i = 0; i < n; i += step) indices.push(i)
  if (indices[indices.length - 1] !== n - 1) indices.push(n - 1)

  // Running gap = heads - tails = 2*heads - (i+1), sampled at indices
  const runningGaps: number[][] = simFlips.map(flips => {
    let heads = 0
    let si = 0
    const sampled: number[] = new Array(indices.length)
    for (let i = 0; i < n; i++) {
      heads += flips[i]
      if (si < indices.length && indices[si] === i) {
        sampled[si] = 2 * heads - (i + 1)
        si++
      }
    }
    return sampled
  })

  // Mean gap at each sampled position
  const meanGaps: number[] = indices.map((_, si) =>
    runningGaps.reduce((sum, g) => sum + g[si], 0) / simFlips.length
  )

  // Y domain: symmetric around expected value, cover all data
  const allVals = runningGaps.flat()
  const dataMin = Math.min(...allVals)
  const dataMax = Math.max(...allVals)
  const pad = Math.max(1, Math.round((dataMax - dataMin) * 0.08))
  const yMin = dataMin - pad
  const yMax = dataMax + pad

  const xScale = (i: number) => marginL + (i / (n - 1 || 1)) * plotW
  const yScale = (v: number) => marginT + plotH * (1 - (v - yMin) / (yMax - yMin || 1))

  const allPaths = runningGaps.map(gaps =>
    gaps.map((g, si) =>
      `${si === 0 ? 'M' : 'L'}${xScale(indices[si]).toFixed(1)},${yScale(g).toFixed(1)}`
    ).join(' ')
  )
  const meanPathD = meanGaps.map((g, si) =>
    `${si === 0 ? 'M' : 'L'}${xScale(indices[si]).toFixed(1)},${yScale(g).toFixed(1)}`
  ).join(' ')

  const lineOpacity =
    simFlips.length <= 5  ? 0.55 :
    simFlips.length <= 15 ? 0.40 :
    simFlips.length <= 40 ? 0.25 :
    simFlips.length <= 100 ? 0.16 : 0.10

  // Y ticks: a few round numbers spanning the range
  const rawStep = (yMax - yMin) / 5
  const tickStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(rawStep))) * Math.round(rawStep / Math.pow(10, Math.floor(Math.log10(rawStep)))))
  const yTicks: number[] = []
  const tStart = Math.ceil(yMin / tickStep) * tickStep
  for (let t = tStart; t <= yMax + 0.001; t += tickStep) yTicks.push(Math.round(t))

  const xTickVals = n <= 10
    ? Array.from({ length: n }, (_, i) => i + 1)
    : [1, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n]

  // Expected final gap = (2p-1)*n
  const expectedFinalGap = (2 * probabilityHeads - 1) * n
  const zeroY = yScale(0)

  return (
    <div>
      <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
        Head–Tail Gap (Heads − Tails, by Flip #)
      </div>
      <div>
        <svg
          width="100%"
          height="auto"
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {/* Grid lines at y ticks */}
          {yTicks.map(t => (
            <line key={t}
              x1={marginL} y1={yScale(t)}
              x2={marginL + plotW} y2={yScale(t)}
              stroke={t === 0 ? '#CBD5E1' : '#E2E8F0'} strokeWidth={t === 0 ? 1.5 : 1}
            />
          ))}

          {/* Zero reference label */}
          {zeroY >= marginT && zeroY <= marginT + plotH && (
            <text x={marginL - 7} y={zeroY + 4} textAnchor="end" fontSize={10} fill="#94A3B8">0</text>
          )}

          {/* Individual sim lines */}
          {allPaths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#64748B" strokeWidth={1} opacity={lineOpacity} />
          ))}

          {/* Mean line */}
          <path d={meanPathD} fill="none" stroke="#0EA5A0" strokeWidth={2.5} />

          {/* Axes */}
          <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH + 1} stroke="#CBD5E1" strokeWidth={1} />
          <line x1={marginL} y1={marginT + plotH + 1} x2={marginL + plotW} y2={marginT + plotH + 1} stroke="#CBD5E1" strokeWidth={1} />

          {/* Y ticks */}
          {yTicks.map(t => (
            <g key={t}>
              <line x1={marginL - 4} y1={yScale(t)} x2={marginL} y2={yScale(t)} stroke="#94A3B8" strokeWidth={1} />
              <text x={marginL - 7} y={yScale(t) + 4} textAnchor="end" fontSize={10} fill="#64748B">{t}</text>
            </g>
          ))}

          {/* X ticks */}
          {xTickVals.map(t => {
            const x = xScale(t - 1)
            return (
              <g key={t}>
                <line x1={x} y1={marginT + plotH + 1} x2={x} y2={marginT + plotH + 6} stroke="#94A3B8" strokeWidth={1} />
                <text x={x} y={marginT + plotH + 18} textAnchor="middle" fontSize={11} fill="#64748B">{t}</text>
              </g>
            )
          })}

          {/* Legend */}
          <line x1={marginL + plotW - 80} y1={marginT + 8} x2={marginL + plotW - 60} y2={marginT + 8} stroke="#0EA5A0" strokeWidth={2.5} />
          <text x={marginL + plotW - 56} y={marginT + 12} fontSize={10} fill="#0EA5A0">mean</text>
          <line x1={marginL + plotW - 80} y1={marginT + 22} x2={marginL + plotW - 60} y2={marginT + 22} stroke="#64748B" strokeWidth={1} opacity={0.5} />
          <text x={marginL + plotW - 56} y={marginT + 26} fontSize={10} fill="#64748B">each sim</text>
        </svg>
      </div>
    </div>
  )
}

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

type CoinFace = 'heads' | 'tails'

function FlipCoin({
  face,
  size,
  spinning = false,
  spinDelay = 0,
}: {
  face: CoinFace
  size: number
  spinning?: boolean
  spinDelay?: number
}) {
  const isHeads = face === 'heads'
  const rimSize = Math.max(2, Math.round(size * 0.06))
  const innerRingInset = Math.max(3, Math.round(size * 0.085))
  const innerInset = Math.max(5, Math.round(size * 0.135))
  const reliefInset = Math.max(9, Math.round(size * 0.225))
  const letterSize = Math.max(10, Math.round(size * 0.36))
  const goldOuter = 'linear-gradient(145deg, #8B6100 0%, #C99300 18%, #F8DD72 40%, #C68800 68%, #7B5100 100%)'
  const goldInner = 'radial-gradient(circle at 32% 28%, #FFF2A3 0%, #F7D24E 24%, #E0A815 58%, #A86900 100%)'
  const silverOuter = 'linear-gradient(145deg, #70757E 0%, #B8BDC5 18%, #F5F7FA 40%, #A0A7B0 68%, #666B73 100%)'
  const silverInner = 'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #E7EBEF 26%, #C7CDD4 58%, #969DA6 100%)'
  const edgeHighlight = isHeads ? 'rgba(255,245,180,0.78)' : 'rgba(255,255,255,0.72)'
  const rimShadow = isHeads ? 'rgba(104,65,0,0.45)' : 'rgba(70,78,88,0.34)'
  const baseRotation = isHeads ? 'rotateY(0deg)' : 'rotateY(180deg)'

  function CoinSurface({
    side,
    rotate,
  }: {
    side: CoinFace
    rotate: string
  }) {
    const sideIsHeads = side === 'heads'
    const sideEdgeHighlight = sideIsHeads ? 'rgba(255,245,180,0.78)' : 'rgba(255,255,255,0.72)'
    const sideStampColor = sideIsHeads ? '#865700' : '#5F6771'
    const sideStampHighlight = sideIsHeads ? 'rgba(255,244,188,0.7)' : 'rgba(255,255,255,0.75)'
    const rimStroke = sideIsHeads ? '#8B6100' : '#70757E'
    const innerRingStroke = sideIsHeads ? 'rgba(255,240,170,0.9)' : 'rgba(255,255,255,0.88)'
    const reliefStroke = sideIsHeads ? 'rgba(142,99,0,0.42)' : 'rgba(98,106,116,0.35)'

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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: sideIsHeads ? goldOuter : silverOuter,
            border: `${rimSize}px solid ${rimStroke}`,
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: innerRingInset,
            borderRadius: '50%',
            border: `${Math.max(1, Math.round(size * 0.025))}px solid ${innerRingStroke}`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.14)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: innerInset,
            borderRadius: '50%',
            background: sideIsHeads ? goldInner : silverInner,
            boxShadow: `inset 0 2px 2px ${sideEdgeHighlight}, inset 0 -4px 6px rgba(0,0,0,0.18)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: reliefInset,
            borderRadius: '50%',
            border: `${Math.max(1, Math.round(size * 0.028))}px solid ${reliefStroke}`,
            boxShadow: `inset 0 1px 0 ${sideEdgeHighlight}, inset 0 -2px 3px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.15)`,
          }}
        />
        <div
          style={{
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
          }}
        />
        <div
          style={{
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
            color: sideStampColor,
            textShadow: `0 1px 0 ${sideStampHighlight}, 0 -1px 0 rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)`,
            transform: 'translateY(-2%)',
            letterSpacing: '0.02em',
            filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.18))',
          }}
        >
          {sideIsHeads ? 'H' : 'T'}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        flexShrink: 0,
        perspective: `${Math.max(140, Math.round(size * 5))}px`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          position: 'relative',
          transform: baseRotation,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            position: 'relative',
            boxSizing: 'border-box',
            boxShadow: spinning
              ? `0 ${Math.round(size * 0.07)}px ${Math.round(size * 0.18)}px rgba(22,52,76,0.18), inset 0 1px 2px rgba(255,255,255,0.24)`
              : `0 ${Math.round(size * 0.08)}px ${Math.round(size * 0.2)}px ${rimShadow}, inset 0 1px 2px rgba(255,255,255,0.4)`,
            transformStyle: 'preserve-3d',
            animation: spinning ? 'coin-flip-spin 0.5s linear infinite' : 'none',
            animationDelay: spinning ? `${spinDelay}ms` : '0ms',
          }}
        >
          <CoinSurface side="heads" rotate="rotateY(0deg)" />
          <CoinSurface side="tails" rotate="rotateY(180deg)" />
        </div>
      </div>
    </div>
  )
}

function getCoinLayout(n: number) {
  const size =
    n <= 12 ? 72 :
    n <= 20 ? 60 :
    n <= 35 ? 48 :
    n <= 55 ? 38 :
    n <= 90 ? 30 :
    n <= 160 ? 22 :
    16
  const gap = Math.max(3, Math.round(size * 0.10))
  const perRow = Math.max(1, Math.floor(860 / (size + gap)))
  return { size, gap, perRow }
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function clampPositiveInt(value: number, max = 10000) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(max, Math.floor(value)))
}

function flipGroup(probabilityHeads: number, flipsPerGroup: number) {
  const flips: number[] = Array.from(
    { length: flipsPerGroup },
    () => (Math.random() < probabilityHeads ? 1 : 0),
  )
  const heads = flips.reduce((sum, value) => sum + value, 0)
  return { flips, heads }
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  )
}

interface SimulationCardProps {
  cardId: string
  config: SimulationCardConfig
}

export function SimulationCard({ cardId, config }: SimulationCardProps) {
  const [probabilityHeads, setProbabilityHeads] = useState(0.5)
  const [flipsPerGroup, setFlipsPerGroup] = useState(10)
  const [numSimulations, setNumSimulations] = useState(30)
  const [simulateSetsMode, setSimulateSetsMode] = useState(false)
  const [history, setHistory] = useState<number[][]>([])
  const [displayFlips, setDisplayFlips] = useState<number[]>([])
  const [isSpinning, setIsSpinning] = useState(false)
  const [multiResults, setMultiResults] = useState<{ heads: number[]; streaks: number[]; switches: number[]; flips: number[][] } | null>(null)
  const [activePlot, setActivePlot] = useState<'convergence' | 'heads' | 'gap' | 'streak' | 'switches'>('convergence')
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recentHeads = history.map(group => group.reduce((sum, value) => sum + value, 0))
  const totalGroups = history.length
  const lastHeads = recentHeads.at(-1) ?? '—'
  const lastFlips = history.at(-1) ?? []
  const visibleFlips = isSpinning
    ? Array.from({ length: flipsPerGroup }, () => 1)
    : (displayFlips.length ? displayFlips : lastFlips)
  const visibleHeads = isSpinning ? null : visibleFlips.reduce((sum, value) => sum + value, 0)
  const { size: coinSize, gap: coinGap, perRow } = useMemo(
    () => getCoinLayout(flipsPerGroup),
    [flipsPerGroup],
  )
  const spinDelays = useMemo(
    () => Array.from({ length: flipsPerGroup }, (_, i) => Math.round((i / Math.max(1, flipsPerGroup)) * 220)),
    [flipsPerGroup],
  )
  const plotOptions = [
    { key: 'convergence', label: 'Proportion' },
    { key: 'heads', label: 'Number of Heads' },
    { key: 'gap', label: 'Head–Tail Gap' },
    { key: 'streak', label: 'Longest Streak' },
    { key: 'switches', label: 'Switches' },
  ] as const

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    }
  }, [])

  function simulateOneGroup() {
    const outcome = flipGroup(probabilityHeads, flipsPerGroup)
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    setIsSpinning(true)
    setDisplayFlips([])
    spinTimerRef.current = setTimeout(() => {
      setDisplayFlips(outcome.flips)
      setIsSpinning(false)
      setHistory(prev => [...prev, outcome.flips])
    }, 700)
  }

  function reset() {
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current)
    setHistory([])
    setDisplayFlips([])
    setIsSpinning(false)
    setMultiResults(null)
  }

  function simulateMany() {
    const n = clampPositiveInt(numSimulations, 200)
    const heads: number[] = []
    const streaks: number[] = []
    const switches: number[] = []
    const allFlips: number[][] = []
    for (let i = 0; i < n; i++) {
      const { flips } = flipGroup(probabilityHeads, flipsPerGroup)
      heads.push(flips.reduce((sum, value) => sum + value, 0))
      streaks.push(longestStreak(flips))
      switches.push(countSwitches(flips))
      allFlips.push(flips)
    }
    setMultiResults({ heads, streaks, switches, flips: allFlips })
  }

  return (
    <div className="h-full overflow-auto">
      <style>{COIN_CSS}</style>
      <div className="grid gap-4 items-start xl:grid-cols-[320px_minmax(0,1fr)]">

          {/* ── Left column: setup + quick stats ── */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--color-text)]">Probability of Heads</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={probabilityHeads}
                  onChange={e => setProbabilityHeads(clampProbability(Number(e.target.value)))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--color-text)]">Number of Coins</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={flipsPerGroup}
                  onChange={e => setFlipsPerGroup(clampPositiveInt(Number(e.target.value), 10000))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-[var(--color-text)] shadow-sm">
              <input
                type="checkbox"
                checked={simulateSetsMode}
                onChange={e => setSimulateSetsMode(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              <span className="font-medium">Simulate sets of flips</span>
            </label>

            {!simulateSetsMode && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={simulateOneGroup}
                  disabled={isSpinning}
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Flip Coins
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            )}

            {simulateSetsMode && (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50"
              >
                Reset
              </button>
            )}

            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Last Heads" value={lastHeads} />
              <StatPill label="Groups Run" value={totalGroups} />
              <StatPill label="Expected" value={(probabilityHeads * flipsPerGroup).toFixed(2)} />
            </div>

            {simulateSetsMode && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-[var(--color-text)]">Number of Simulations</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={numSimulations}
                    onChange={e => setNumSimulations(clampPositiveInt(Number(e.target.value), 200))}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
                  />
                </label>

                <button
                  type="button"
                  onClick={simulateMany}
                  disabled={isSpinning}
                  className="w-full rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Simulate Many
                </button>

                <div className="flex flex-wrap gap-1.5">
                  {plotOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActivePlot(key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        activePlot === key
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Right column: shared display area ── */}
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              {!simulateSetsMode ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-text)]">Latest Group Flip</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {isSpinning
                          ? `Flipping ${flipsPerGroup} coin${flipsPerGroup !== 1 ? 's' : ''}...`
                          : `${flipsPerGroup} flip${flipsPerGroup !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--color-muted)]">
                      p(H): <span className="font-semibold text-[var(--color-text)]">{probabilityHeads.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
                    {history.length === 0 && !isSpinning ? (
                      <div className="flex min-h-[320px] items-center justify-center text-sm text-[var(--color-muted)]">
                        No groups simulated yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex min-h-[320px] flex-wrap content-start items-start" style={{ gap: coinGap }}>
                          {visibleFlips.map((value, index) => (
                            <FlipCoin
                              key={`${index}-${isSpinning ? 'spin' : value}`}
                              face={(value ? 'heads' : 'tails')}
                              size={coinSize}
                              spinning={isSpinning}
                              spinDelay={spinDelays[index] ?? 0}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                          <span>H: <span className="font-semibold text-[var(--color-text)]">{visibleHeads ?? '—'}</span></span>
                          <span>T: <span className="font-semibold text-[var(--color-text)]">{visibleHeads === null ? '—' : visibleFlips.length - visibleHeads}</span></span>
                          <span>Rows: <span className="font-semibold text-[var(--color-text)]">{Math.max(1, Math.ceil(flipsPerGroup / perRow))}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-text)]">Set Simulation Graph</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {multiResults
                          ? `${multiResults.streaks.length} simulation${multiResults.streaks.length !== 1 ? 's' : ''} · ${flipsPerGroup} coins each`
                          : `Simulate sets of ${flipsPerGroup} coin${flipsPerGroup !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--color-muted)]">
                      p(H): <span className="font-semibold text-[var(--color-text)]">{probabilityHeads.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
                    {multiResults ? (
                      <div className="min-h-[420px]">
                        {activePlot === 'convergence' && (
                          <ConvergencePlotSVG simFlips={multiResults.flips} probabilityHeads={probabilityHeads} />
                        )}
                        {activePlot === 'heads' && (
                          <DotPlotSVG
                            values={multiResults.heads}
                            label="Number of Heads"
                            xMin={0}
                            xMax={flipsPerGroup}
                            color="#D97706"
                          />
                        )}
                        {activePlot === 'gap' && (
                          <GapPlotSVG simFlips={multiResults.flips} probabilityHeads={probabilityHeads} />
                        )}
                        {activePlot === 'streak' && (
                          <DotPlotSVG
                            values={multiResults.streaks}
                            label="Longest Streak (consecutive H's or T's)"
                            xMin={Math.min(...multiResults.streaks)}
                            xMax={Math.max(...multiResults.streaks)}
                            color="#0EA5A0"
                          />
                        )}
                        {activePlot === 'switches' && (
                          <DotPlotSVG
                            values={multiResults.switches}
                            label="Number of Switches (H→T or T→H)"
                            xMin={Math.min(...multiResults.switches)}
                            xMax={Math.max(...multiResults.switches)}
                            color="#6366F1"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex min-h-[420px] items-center justify-center text-sm text-[var(--color-muted)]">
                        Click <span className="mx-1 font-medium text-[var(--color-text)]">Simulate Many</span> to see graphs here.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
