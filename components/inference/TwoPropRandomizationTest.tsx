'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Alternative,
  TwoProportionData,
  TwoProportionResult,
  buildTwoProportionData,
  isExtremeResult,
  runTwoProportionRandomization,
} from '@/lib/randomizationTest'

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage =
  | 'observed'    // initial: two observed columns
  | 'pooling'     // cases animating to center
  | 'pooled'      // all in center column
  | 'reassigning' // cases animating to randomized left/right
  | 'computing'   // randomized columns visible, stats highlighted
  | 'plotting'    // diff_sim dot drops onto null distribution
  | 'done'        // waiting for next action

interface TileLayout {
  size: number   // px per tile side
  step: number   // size + gap
  perRow: number // tiles per column row
}

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: Record<string, TwoProportionData> = {
  titanic: buildTwoProportionData(
    75, 16,   // n1=Male, s1=survived
    25, 21,   // n2=Female, s2=survived
    'Male', 'Female', 'Survived', 'Died',
  ),
  yawn: buildTwoProportionData(
    34, 10,   // Seeded group
    16, 4,    // Control group
    'Seeded', 'Control', 'Yawned', "Didn't Yawn",
  ),
  drug: buildTwoProportionData(
    40, 28,   // Treatment group
    40, 14,   // Placebo group
    'Treatment', 'Placebo', 'Improved', 'No change',
  ),
}

// ── Layout constants ──────────────────────────────────────────────────────────

const CANVAS_W = 500
const CANVAS_H = 350
const HEADER_H = 52   // space above tiles for column labels
const COL_W    = 128  // usable tile area per column

const COL_CX: Record<'left' | 'center' | 'right', number> = {
  left:   82,
  center: 250,
  right:  418,
}

function getTileLayout(n: number): TileLayout {
  const size = n <= 30 ? 16 : n <= 60 ? 12 : n <= 120 ? 9 : 7
  const gap  = Math.max(1, Math.floor(size / 4))
  const step = size + gap
  const perRow = Math.max(1, Math.floor(COL_W / step))
  return { size, step, perRow }
}

function getSlotXY(
  idx: number,
  colCx: number,
  layout: TileLayout,
  colSize: number,
): { x: number; y: number } {
  const cols    = Math.min(layout.perRow, colSize)
  const offsetX = colCx - (cols * layout.step) / 2
  return {
    x: offsetX + (idx % cols) * layout.step,
    y: HEADER_H + Math.floor(idx / cols) * layout.step,
  }
}

function computePositions(
  data: TwoProportionData,
  stage: Stage,
  assignment: number[],
): Map<number, { x: number; y: number }> {
  const { cases, n1 } = data
  const n      = cases.length
  const layout = getTileLayout(n)
  const pos    = new Map<number, { x: number; y: number }>()

  if (stage === 'observed' || stage === 'pooling') {
    const g1 = cases.filter(c => c.group === 0).sort((a, b) => b.response - a.response)
    const g2 = cases.filter(c => c.group === 1).sort((a, b) => b.response - a.response)
    g1.forEach((c, i) => pos.set(c.id, getSlotXY(i, COL_CX.left,  layout, g1.length)))
    g2.forEach((c, i) => pos.set(c.id, getSlotXY(i, COL_CX.right, layout, g2.length)))
    return pos
  }

  if (stage === 'pooled' || stage === 'reassigning') {
    cases.forEach((c, i) => pos.set(c.id, getSlotXY(i, COL_CX.center, layout, n)))
    return pos
  }

  // computing / plotting / done → randomized split
  const assignSet = new Set(assignment)
  const g1Sim = cases.filter(c =>  assignSet.has(c.id)).sort((a, b) => b.response - a.response)
  const g2Sim = cases.filter(c => !assignSet.has(c.id)).sort((a, b) => b.response - a.response)
  g1Sim.forEach((c, i) => pos.set(c.id, getSlotXY(i, COL_CX.left,  layout, n1)))
  g2Sim.forEach((c, i) => pos.set(c.id, getSlotXY(i, COL_CX.right, layout, cases.length - n1)))
  return pos
}

// ── Null distribution plot ────────────────────────────────────────────────────

const BUCKET = 0.05

function bucketVal(v: number) {
  return Math.round(v / BUCKET) * BUCKET
}

function NullDistPlot({
  values,
  diffObs,
  alternative,
}: {
  values: number[]
  diffObs: number
  alternative: Alternative
}) {
  const clipId = useId()
  const SVG_W = 340, SVG_H = 200
  const MG = { t: 18, r: 10, b: 36, l: 10 }
  const PW = SVG_W - MG.l - MG.r
  const PH = SVG_H - MG.t - MG.b

  const xOf = (v: number) => ((v + 1) / 2) * PW

  // Stack dots per bucket
  const stackMap = new Map<number, number>()
  const circles: { cx: number; cy: number; extreme: boolean }[] = []
  for (const v of values) {
    const b = bucketVal(v)
    const si = stackMap.get(b) ?? 0
    stackMap.set(b, si + 1)
    circles.push({
      cx: xOf(b),
      cy: PH - si * 0,  // placeholder; we'll compute y with dotStep
      extreme: isExtremeResult(v, diffObs, alternative),
    })
  }

  const maxStack = Math.max(1, ...Array.from(stackMap.values()))
  const dotStep  = Math.max(2, Math.min(8, PH / maxStack))
  const dotR     = Math.max(1.2, dotStep / 2 - 0.4)

  // Recompute y with correct dotStep
  const circlesFinal: { cx: number; cy: number; extreme: boolean }[] = []
  const seenC2 = new Map<number, number>()
  for (const v of values) {
    const b  = bucketVal(v)
    const si = seenC2.get(b) ?? 0
    seenC2.set(b, si + 1)
    circlesFinal.push({
      cx: xOf(b),
      cy: PH - si * dotStep - dotR,
      extreme: isExtremeResult(v, diffObs, alternative),
    })
  }

  // Tail shading path
  const obsX = xOf(diffObs)
  let shadePath = ''
  if (alternative === 'greater') {
    shadePath = `M${obsX},0 H${PW} V${PH} H${obsX} Z`
  } else if (alternative === 'less') {
    shadePath = `M0,0 H${obsX} V${PH} H0 Z`
  } else {
    const xL = xOf(-Math.abs(diffObs))
    const xR = xOf( Math.abs(diffObs))
    shadePath = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z`
  }

  const ticks = [-1, -0.5, 0, 0.5, 1]

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: SVG_H }}>
      <style>{`
        @keyframes dot-drop {
          from { transform: translateY(-40px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={PW} height={PH} />
        </clipPath>
      </defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        {/* Tail shading */}
        <path d={shadePath} fill="#0EA5A0" opacity={0.10} />

        {/* Baseline */}
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5} />

        {/* Ticks */}
        {ticks.map(v => (
          <g key={v} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={4} stroke="#CBD5E1" strokeWidth={1} />
            <text y={14} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans, sans-serif">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Dots */}
        <g clipPath={`url(#${clipId})`}>
          {circlesFinal.map((c, i) => (
            <circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={dotR}
              fill={c.extreme ? '#0EA5A0' : '#94A3B8'}
              opacity={0.85}
              style={i === circlesFinal.length - 1 && values.length > 0
                ? { animation: 'dot-drop 280ms ease-out' }
                : undefined}
            />
          ))}
        </g>

        {/* Observed statistic line */}
        <line
          x1={obsX} y1={0} x2={obsX} y2={PH}
          stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3"
        />
        <text
          x={obsX + (diffObs >= 0 ? 4 : -4)}
          y={6}
          textAnchor={diffObs >= 0 ? 'start' : 'end'}
          fontSize={9} fill="#EF4444" fontFamily="DM Sans, sans-serif" fontWeight="600"
        >
          obs
        </text>

        {/* X label */}
        <text
          x={PW / 2} y={PH + 28}
          textAnchor="middle" fontSize={10} fill="#94A3B8" fontFamily="DM Sans, sans-serif"
        >
          Simulated p̂₁ − p̂₂
        </text>
      </g>
    </svg>
  )
}

// ── Stage caption ─────────────────────────────────────────────────────────────

const CAPTIONS: Record<Stage, string> = {
  observed:    'Observed data — cases sorted within each group',
  pooling:     'Pooling all outcomes under the null hypothesis…',
  pooled:      'Under H₀: group labels removed, outcomes fixed',
  reassigning: 'Randomly reassigning cases to groups…',
  computing:   'Counting simulated successes in each group',
  plotting:    'Recording simulated statistic on null distribution',
  done:        'Done — click Step or Run to simulate again',
}

// ── Column overlay labels ────────────────────────────────────────────────────

function colStats(
  cases: TwoProportionData['cases'],
  group: 0 | 1,
  assignment: number[] | null,
  stage: Stage,
): { n: number; s: number; p: number } {
  const useObs = stage === 'observed' || stage === 'pooling'
  let members: typeof cases
  if (useObs) {
    members = cases.filter(c => c.group === group)
  } else if (assignment) {
    const aSet = new Set(assignment)
    members = group === 0
      ? cases.filter(c => aSet.has(c.id))
      : cases.filter(c => !aSet.has(c.id))
  } else {
    return { n: 0, s: 0, p: 0 }
  }
  const n = members.length
  const s = members.filter(c => c.response === 1).length
  return { n, s, p: n > 0 ? s / n : 0 }
}

// ── Main component ────────────────────────────────────────────────────────────

export function TwoPropRandomizationTest() {
  const [presetKey, setPresetKey]             = useState<string>('titanic')
  const [alternative, setAlternative]         = useState<Alternative>('less')
  const [demoMode, setDemoMode]               = useState(true)
  const [animSpeed, setAnimSpeed]             = useState(1)
  const [stage, setStage]                     = useState<Stage>('observed')
  const [assignment, setAssignment]           = useState<number[]>([])
  const [currentResult, setCurrentResult]     = useState<TwoProportionResult | null>(null)
  const [nullDist, setNullDist]               = useState<number[]>([])
  const [simCount, setSimCount]               = useState(0)
  const [extremeCount, setExtremeCount]       = useState(0)
  const [highlightSim, setHighlightSim]       = useState(false)

  const data           = PRESETS[presetKey]
  const cases          = data.cases
  const layout         = getTileLayout(cases.length)
  const tDur           = demoMode ? Math.round(480 / animSpeed) : 0
  const isAnimating    = stage !== 'observed' && stage !== 'done'
  const pValue         = simCount > 0 ? extremeCount / simCount : null
  const positions      = computePositions(data, stage, assignment)

  // Keep mutable refs to avoid stale closures in the stage machine
  const dataRef        = useRef(data)
  const altRef         = useRef(alternative)
  const resultRef      = useRef<TwoProportionResult | null>(null)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { altRef.current  = alternative }, [alternative])

  // ── Stage machine ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'observed' || stage === 'done') return

    const base = Math.max(120, tDur + 80)
    let id: ReturnType<typeof setTimeout>

    if (stage === 'pooling') {
      id = setTimeout(() => setStage('pooled'), base)

    } else if (stage === 'pooled') {
      id = setTimeout(() => {
        const result = runTwoProportionRandomization(dataRef.current)
        resultRef.current = result
        setAssignment(result.assignment)
        setCurrentResult(result)
        setStage('reassigning')
      }, Math.round(base * 0.35))

    } else if (stage === 'reassigning') {
      id = setTimeout(() => {
        setHighlightSim(true)
        setStage('computing')
      }, base)

    } else if (stage === 'computing') {
      id = setTimeout(() => {
        setHighlightSim(false)
        setStage('plotting')
      }, Math.round(base * 0.9))

    } else if (stage === 'plotting') {
      id = setTimeout(() => {
        const result = resultRef.current
        if (result) {
          setNullDist(prev => [...prev, result.diffSim])
          setSimCount(prev => prev + 1)
          if (isExtremeResult(result.diffSim, dataRef.current.diffObs, altRef.current)) {
            setExtremeCount(prev => prev + 1)
          }
        }
        setStage('done')
      }, Math.round(base * 0.55))
    }

    return () => clearTimeout(id)
  }, [stage, tDur])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleStep() {
    if (isAnimating) return
    setStage('pooling')
  }

  function runBatch(count: number) {
    const diffs: number[] = []
    let newExtreme = 0
    for (let i = 0; i < count; i++) {
      const r = runTwoProportionRandomization(data)
      diffs.push(r.diffSim)
      if (isExtremeResult(r.diffSim, data.diffObs, alternative)) newExtreme++
    }
    setNullDist(prev => [...prev, ...diffs])
    setSimCount(prev => prev + count)
    setExtremeCount(prev => prev + newExtreme)
    // Show last result in columns
    if (diffs.length > 0) {
      const last = runTwoProportionRandomization(data)
      setAssignment(last.assignment)
      setCurrentResult(last)
      setStage('done')
    }
  }

  function handleReset() {
    setStage('observed')
    setAssignment([])
    setCurrentResult(null)
    setNullDist([])
    setSimCount(0)
    setExtremeCount(0)
    setHighlightSim(false)
  }

  function handlePresetChange(key: string) {
    setPresetKey(key)
    handleReset()
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const showSplit = stage !== 'pooled' && stage !== 'reassigning' && stage !== 'pooling'
  const showCenter = stage === 'pooled' || stage === 'reassigning' || stage === 'pooling'
  const showRandomized = stage === 'computing' || stage === 'plotting' || stage === 'done'

  const leftStats  = colStats(cases, 0, showRandomized ? assignment : null, stage)
  const rightStats = colStats(cases, 1, showRandomized ? assignment : null, stage)

  const transitionStyle = `left ${tDur}ms ease-in-out, top ${tDur}ms ease-in-out`

  // Column header labels
  const leftLabel  = data.group1Label
  const rightLabel = data.group2Label

  return (
    <div className="space-y-4">
      {/* ── Config bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Dataset</span>
          <select
            value={presetKey}
            onChange={e => handlePresetChange(e.target.value)}
            disabled={isAnimating}
            className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white"
          >
            <option value="titanic">Titanic — Sex vs Survival</option>
            <option value="yawn">Yawning Experiment</option>
            <option value="drug">Drug Trial</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₁</span>
          <select
            value={alternative}
            onChange={e => setAlternative(e.target.value as Alternative)}
            disabled={isAnimating}
            className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white"
          >
            <option value="less">p₁ − p₂ &lt; 0</option>
            <option value="greater">p₁ − p₂ &gt; 0</option>
            <option value="two">p₁ − p₂ ≠ 0</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Mode</span>
          <button
            onClick={() => setDemoMode(m => !m)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
              demoMode
                ? 'bg-[var(--color-accent)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-muted)]'
            }`}
          >
            {demoMode ? 'Demo' : 'Fast'}
          </button>
        </div>

        {demoMode && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)]">Speed</span>
            <input
              type="range" min={0.5} max={3} step={0.5}
              value={animSpeed}
              onChange={e => setAnimSpeed(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-[var(--color-muted)] w-6">{animSpeed}×</span>
          </div>
        )}
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-4">

        {/* ── Animation canvas ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 rounded-2xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
          {/* Column header labels */}
          <div className="relative border-b border-[var(--color-border)] bg-slate-50 px-4 py-2"
               style={{ width: CANVAS_W }}>
            <div className="flex justify-between text-xs font-semibold text-[var(--color-text)]">
              <span style={{ position: 'absolute', left: COL_CX.left,  transform: 'translateX(-50%)', bottom: 8 }}>
                {leftLabel}
              </span>
              {showCenter && (
                <span style={{ position: 'absolute', left: COL_CX.center, transform: 'translateX(-50%)', bottom: 8 }}
                      className="text-[var(--color-muted)]">
                  Pooled
                </span>
              )}
              <span style={{ position: 'absolute', left: COL_CX.right, transform: 'translateX(-50%)', bottom: 8 }}>
                {rightLabel}
              </span>
            </div>
            <div style={{ height: 20 }} />
          </div>

          {/* Tile canvas */}
          <div
            className="relative bg-white"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {/* Column zone backgrounds */}
            <div className="absolute inset-y-0" style={{
              left: COL_CX.left - COL_W / 2 - 4,
              width: COL_W + 8,
              background: showSplit ? 'rgba(14,165,160,0.03)' : 'transparent',
              borderRight: showSplit ? '1px dashed rgba(14,165,160,0.15)' : 'none',
              transition: 'background 400ms, border 400ms',
            }} />
            <div className="absolute inset-y-0" style={{
              left: COL_CX.right - COL_W / 2 - 4,
              width: COL_W + 8,
              background: showSplit ? 'rgba(14,165,160,0.03)' : 'transparent',
              borderLeft: showSplit ? '1px dashed rgba(14,165,160,0.15)' : 'none',
              transition: 'background 400ms, border 400ms',
            }} />

            {/* Case tiles */}
            {cases.map(c => {
              const p = positions.get(c.id) ?? { x: -20, y: -20 }
              const isSuccess = c.response === 1
              return (
                <div
                  key={c.id}
                  style={{
                    position: 'absolute',
                    left: p.x,
                    top: p.y,
                    width: layout.size,
                    height: layout.size,
                    transition: transitionStyle,
                    borderRadius: Math.max(1, layout.size / 6),
                    background: isSuccess ? '#0EA5A0' : 'transparent',
                    border: `${Math.max(1, layout.size / 8)}px solid #0EA5A0`,
                    opacity: isSuccess ? 0.82 : 0.55,
                    boxSizing: 'border-box',
                  }}
                  aria-label={isSuccess ? data.successLabel : data.failureLabel}
                />
              )
            })}

            {/* Column stat overlays — shown in observed/done states */}
            {showSplit && (
              <>
                <ColStatLabel
                  cx={COL_CX.left}
                  n={showRandomized ? leftStats.n : data.n1}
                  s={showRandomized ? leftStats.s : data.s1}
                  p={showRandomized ? leftStats.p : data.p1}
                  highlight={highlightSim && showRandomized}
                  layout={layout}
                />
                <ColStatLabel
                  cx={COL_CX.right}
                  n={showRandomized ? rightStats.n : data.n2}
                  s={showRandomized ? rightStats.s : data.s2}
                  p={showRandomized ? rightStats.p : data.p2}
                  highlight={highlightSim && showRandomized}
                  layout={layout}
                />
              </>
            )}
          </div>

          {/* Caption bar */}
          <div className="border-t border-[var(--color-border)] bg-slate-50 px-4 py-2.5"
               style={{ width: CANVAS_W }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className="inline-block w-3 h-3 rounded-sm bg-[var(--color-accent)] opacity-80" />
                {data.successLabel}
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className="inline-block w-3 h-3 rounded-sm border-2 border-[var(--color-accent)] opacity-55" />
                {data.failureLabel}
              </div>
              <span className="ml-auto text-xs italic text-[var(--color-muted)]">
                {CAPTIONS[stage]}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right panel: stats + null distribution ──────────────────────── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Observed stats */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Observed Data
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatCell label={data.group1Label} value={`p̂₁ = ${data.p1.toFixed(3)}`} sub={`${data.s1} / ${data.n1}`} />
              <StatCell label={data.group2Label} value={`p̂₂ = ${data.p2.toFixed(3)}`} sub={`${data.s2} / ${data.n2}`} />
              <StatCell
                label="Observed diff"
                value={data.diffObs.toFixed(3)}
                sub="p̂₁ − p̂₂"
                accent
              />
            </div>
          </div>

          {/* Current simulation stats */}
          {currentResult && (
            <div className={`rounded-2xl border shadow-sm p-4 space-y-3 transition-colors ${
              highlightSim
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                : 'border-[var(--color-border)] bg-white'
            }`}>
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Current Simulation #{simCount + (stage === 'done' ? 0 : 1)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <StatCell
                  label={data.group1Label}
                  value={`p̂₁ = ${currentResult.p1Sim.toFixed(3)}`}
                  sub={`${currentResult.s1Sim} / ${data.n1}`}
                />
                <StatCell
                  label={data.group2Label}
                  value={`p̂₂ = ${currentResult.p2Sim.toFixed(3)}`}
                  sub={`${currentResult.s2Sim} / ${data.n2}`}
                />
                <StatCell
                  label="Simulated diff"
                  value={currentResult.diffSim.toFixed(3)}
                  sub={isExtremeResult(currentResult.diffSim, data.diffObs, alternative) ? '★ extreme' : 'not extreme'}
                  accent={isExtremeResult(currentResult.diffSim, data.diffObs, alternative)}
                />
              </div>
            </div>
          )}

          {/* Null distribution */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Null Distribution
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {simCount} simulation{simCount !== 1 ? 's' : ''}
              </div>
            </div>

            {simCount === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-[var(--color-muted)]">
                Run simulations to build the null distribution
              </div>
            ) : (
              <NullDistPlot
                values={nullDist}
                diffObs={data.diffObs}
                alternative={alternative}
              />
            )}

            {/* P-value display */}
            <div className="flex items-center gap-3 pt-1 border-t border-[var(--color-border)]">
              <div className="text-xs text-[var(--color-muted)]">
                Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span>
                {' / '}{simCount}
              </div>
              <div className="ml-auto text-sm font-bold text-[var(--color-accent)]">
                {pValue !== null
                  ? `p ≈ ${pValue < 0.001 ? '< 0.001' : pValue.toFixed(4)}`
                  : 'p = —'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
        {demoMode && (
          <button
            onClick={handleStep}
            disabled={isAnimating}
            className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {isAnimating ? 'Animating…' : 'Step'}
          </button>
        )}

        {[10, 100, 1000].map(n => (
          <button
            key={n}
            onClick={() => runBatch(n)}
            disabled={isAnimating}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium
                       text-[var(--color-text)] hover:bg-slate-50
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Run {n.toLocaleString()}
          </button>
        ))}

        <button
          onClick={handleReset}
          disabled={isAnimating}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium
                     text-[var(--color-muted)] hover:bg-slate-50
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reset
        </button>

        <div className="ml-auto text-xs text-[var(--color-muted)] space-x-3">
          <span>n₁ = {data.n1}</span>
          <span>n₂ = {data.n2}</span>
          <span>Total = {cases.length}</span>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className={`rounded-xl p-2 ${accent ? 'bg-[var(--color-accent-light)]' : 'bg-slate-50 border border-slate-100'}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] truncate">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-muted)]">{sub}</div>
    </div>
  )
}

function ColStatLabel({
  cx,
  n, s, p,
  highlight,
  layout,
}: {
  cx: number
  n: number
  s: number
  p: number
  highlight: boolean
  layout: TileLayout
}) {
  const rows = Math.ceil(n / Math.max(1, Math.floor(COL_W / layout.step)))
  const top  = HEADER_H + rows * layout.step + 8

  return (
    <div
      style={{
        position: 'absolute',
        left: cx,
        top,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
          highlight
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-slate-100 text-[var(--color-muted)]'
        }`}
      >
        {s}/{n} = {p.toFixed(3)}
      </div>
    </div>
  )
}
