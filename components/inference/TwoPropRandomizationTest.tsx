'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { TwoPropRandomizationCardConfig } from '@/lib/exploreTypes'
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
  | 'observed'    // initial / pause — waiting for Step 1
  | 'pooling'     // cards animating to center pile
  | 'pooled'      // pause — pool visible, waiting for Step 2
  | 'reassigning' // cards dealing out
  | 'computing'   // pause — randomized stats highlighted, waiting for Step 3
  | 'plotting'    // dot drops onto null distribution
  | 'done'        // pause — cycle complete

interface CardLayout {
  w: number; h: number; stepX: number; stepY: number; perRow: number
}

interface CardPos {
  x: number; y: number; rotation: number; delay: number; faceDown: boolean
}

// ── Layout constants ──────────────────────────────────────────────────────────

const CANVAS_W = 500
const CANVAS_H = 350
const HEADER_H = 52
const COL_W    = 128
const ANIM_DUR = 520
const STAGGER  = 150

const COL_CX: Record<'left' | 'center' | 'right', number> = {
  left: 82, center: 250, right: 418,
}
const PILE_CY = HEADER_H + (CANVAS_H - HEADER_H) / 2

function getCardLayout(n: number): CardLayout {
  const w = n <= 20 ? 22 : n <= 40 ? 16 : n <= 80 ? 12 : n <= 160 ? 9 : 7
  const h = Math.ceil(w * 1.55)
  const gap = 2
  const stepX = w + gap
  const stepY = h + gap
  return { w, h, stepX, stepY, perRow: Math.max(1, Math.floor(COL_W / stepX)) }
}

function cardHash(id: number, salt = 0): number {
  return (((id + 1) * 2654435761 + salt * 40503) >>> 0) / 4294967296
}

function getSlotXY(idx: number, colCx: number, layout: CardLayout, groupSize: number) {
  const cols    = Math.min(layout.perRow, groupSize)
  const offsetX = colCx - (cols * layout.stepX) / 2
  return {
    x: offsetX + (idx % cols) * layout.stepX,
    y: HEADER_H + Math.floor(idx / cols) * layout.stepY,
  }
}

function computePositions(
  data: TwoProportionData, stage: Stage, assignment: number[],
): Map<number, CardPos> {
  const { cases, n1 } = data
  const n      = cases.length
  const layout = getCardLayout(n)
  const pos    = new Map<number, CardPos>()

  if (stage === 'observed') {
    const g1 = cases.filter(c => c.group === 0).sort((a, b) => b.response - a.response)
    const g2 = cases.filter(c => c.group === 1).sort((a, b) => b.response - a.response)
    g1.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, g1.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    g2.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, g2.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    return pos
  }

  if (stage === 'pooling' || stage === 'pooled') {
    cases.forEach(c => {
      const jX  = (cardHash(c.id, 0) - 0.5) * 12
      const jY  = (cardHash(c.id, 1) - 0.5) * 8
      const rot = (cardHash(c.id, 2) - 0.5) * 40
      pos.set(c.id, { x: COL_CX.center - layout.w/2 + jX, y: PILE_CY - layout.h/2 + jY, rotation: rot, delay: 0, faceDown: true })
    })
    return pos
  }

  if (stage === 'reassigning') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    g1Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:(i/n)*STAGGER,faceDown:true}) })
    g2Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:((n1+i)/n)*STAGGER,faceDown:true}) })
    return pos
  }

  // computing / plotting / done → face-up in their slots
  const aSet  = new Set(assignment)
  const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
  const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
  g1Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  g2Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  return pos
}

// ── Null distribution plot ────────────────────────────────────────────────────

const BUCKET = 0.05

function NullDistPlot({ values, diffObs, alternative }: {
  values: number[]; diffObs: number; alternative: Alternative
}) {
  const clipId = useId()
  const SVG_W = 340, SVG_H = 200
  const MG = { t: 18, r: 10, b: 36, l: 10 }
  const PW = SVG_W - MG.l - MG.r, PH = SVG_H - MG.t - MG.b
  const xOf = (v: number) => ((v + 1) / 2) * PW

  const seenC2 = new Map<number, number>()
  const circlesFinal: { cx: number; cy: number; extreme: boolean }[] = []
  const maxStack = (() => {
    const m = new Map<number, number>()
    values.forEach(v => { const b = Math.round(v/BUCKET)*BUCKET; m.set(b, (m.get(b)??0)+1) })
    return Math.max(1, ...Array.from(m.values()))
  })()
  const dotStep = Math.max(2, Math.min(8, PH / maxStack))
  const dotR    = Math.max(1.2, dotStep / 2 - 0.4)
  for (const v of values) {
    const b  = Math.round(v/BUCKET)*BUCKET
    const si = seenC2.get(b) ?? 0
    seenC2.set(b, si + 1)
    circlesFinal.push({ cx: xOf(b), cy: PH - si * dotStep - dotR, extreme: isExtremeResult(v, diffObs, alternative) })
  }

  const obsX = xOf(diffObs)
  let shadePath = ''
  if (alternative === 'greater') shadePath = `M${obsX},0 H${PW} V${PH} H${obsX} Z`
  else if (alternative === 'less') shadePath = `M0,0 H${obsX} V${PH} H0 Z`
  else { const xL = xOf(-Math.abs(diffObs)), xR = xOf(Math.abs(diffObs)); shadePath = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z` }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: SVG_H }}>
      <style>{`@keyframes dot-drop { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH} /></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shadePath} fill="#0EA5A0" opacity={0.10} />
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5} />
        {[-1, -0.5, 0, 0.5, 1].map(v => (
          <g key={v} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={4} stroke="#CBD5E1" strokeWidth={1} />
            <text y={14} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans, sans-serif">{v.toFixed(1)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circlesFinal.map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR} fill={c.extreme ? '#0EA5A0' : '#94A3B8'} opacity={0.85}
              style={i === circlesFinal.length - 1 && values.length > 0 ? { animation: 'dot-drop 280ms ease-out' } : undefined} />
          ))}
        </g>
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3" />
        <text x={obsX + (diffObs >= 0 ? 4 : -4)} y={6} textAnchor={diffObs >= 0 ? 'start' : 'end'} fontSize={9} fill="#EF4444" fontFamily="DM Sans, sans-serif" fontWeight="600">obs</text>
        <text x={PW / 2} y={PH + 28} textAnchor="middle" fontSize={10} fill="#94A3B8" fontFamily="DM Sans, sans-serif">Simulated p̂₁ − p̂₂</text>
      </g>
    </svg>
  )
}

// ── Stage captions ────────────────────────────────────────────────────────────

const STEP_LABELS: Partial<Record<Stage, string>> = {
  observed:  '1. Pool Cards',
  pooled:    '2. Reassign',
  computing: '3. Record',
  done:      '1. Pool Cards',
}

const CAPTIONS: Record<Stage, string> = {
  observed:    'Observed data — press Step 1 to pool all outcomes',
  pooling:     'Pooling all outcomes under the null hypothesis…',
  pooled:      'Under H₀: labels removed — press Step 2 to randomly reassign',
  reassigning: 'Randomly dealing cards to groups…',
  computing:   'Simulated result — press Step 3 to record on null distribution',
  plotting:    'Recording simulated statistic…',
  done:        'Done — press Step to simulate again, or Run for many at once',
}

// ── Column stat helpers ───────────────────────────────────────────────────────

function colStats(cases: TwoProportionData['cases'], group: 0|1, assignment: number[]|null, stage: Stage) {
  const useObs = stage === 'observed' || stage === 'pooling'
  let members: typeof cases
  if (useObs) {
    members = cases.filter(c => c.group === group)
  } else if (assignment) {
    const aSet = new Set(assignment)
    members = group === 0 ? cases.filter(c => aSet.has(c.id)) : cases.filter(c => !aSet.has(c.id))
  } else return { n: 0, s: 0, p: 0 }
  const n = members.length
  const s = members.filter(c => c.response === 1).length
  return { n, s, p: n > 0 ? s / n : 0 }
}

// ── Main component ────────────────────────────────────────────────────────────

type SourceMode = 'data' | 'manual'

interface Props {
  cardId: string
  config: TwoPropRandomizationCardConfig
  onClearZone: (zone: string) => void
}

export function TwoPropRandomizationTest({ cardId, config, onClearZone }: Props) {
  const { grid, updateExploreCard } = useStore()

  // Config state
  const [sourceMode, setSourceMode]     = useState<SourceMode>('data')
  const [alternative, setAlternative]   = useState<Alternative>('less')
  const [nullDiff, setNullDiff]         = useState('0')
  const [successLevel, setSuccessLevel] = useState('')
  const [groupA, setGroupA]             = useState('')
  const [groupB, setGroupB]             = useState('')
  const [manualS1, setManualS1]         = useState('50')
  const [manualN1, setManualN1]         = useState('100')
  const [manualS2, setManualS2]         = useState('50')
  const [manualN2, setManualN2]         = useState('100')
  const [manualLabel1, setManualLabel1] = useState('Group 1')
  const [manualLabel2, setManualLabel2] = useState('Group 2')
  const [simLaunched, setSimLaunched]   = useState(false)

  // Simulation state
  const [stage, setStage]               = useState<Stage>('observed')
  const [assignment, setAssignment]     = useState<number[]>([])
  const [currentResult, setCurrentResult] = useState<TwoProportionResult | null>(null)
  const [nullDist, setNullDist]         = useState<number[]>([])
  const [simCount, setSimCount]         = useState(0)
  const [extremeCount, setExtremeCount] = useState(0)
  const [highlightSim, setHighlightSim] = useState(false)

  // Drop zone handling
  const responseCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const groupCol    = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null

  function handleNativeDrop(zone: 'var1' | 'var2') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      const droppedCol = useStore.getState().grid.columns.find(c => c.id === colId)
      if (!droppedCol || droppedCol.type !== 'categorical') return
      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
      if (!current || current.config.type !== 'two-prop-randomization') return
      updateExploreCard(cardId, { config: { ...current.config, ...(zone === 'var1' ? { var1ColId: colId } : { var2ColId: colId }) } })
    }
  }
  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }

  const responseLevels = useMemo(() => {
    if (!config.var1ColId) return []
    return [...new Set(grid.rows.map(r => String(r[config.var1ColId!] ?? '').trim()).filter(Boolean))].sort()
  }, [grid.rows, config.var1ColId])

  const groupLevels = useMemo(() => {
    if (!config.var2ColId) return []
    return [...new Set(grid.rows.map(r => String(r[config.var2ColId!] ?? '').trim()).filter(Boolean))].sort()
  }, [grid.rows, config.var2ColId])

  useEffect(() => {
    if (responseLevels.length > 0)
      setSuccessLevel(cur => (cur && responseLevels.includes(cur)) ? cur : responseLevels[0])
  }, [responseLevels])

  useEffect(() => {
    if (groupLevels.length >= 2) {
      setGroupA(cur => (cur && groupLevels.includes(cur)) ? cur : groupLevels[0])
      setGroupB(cur => (cur && groupLevels.includes(cur) && cur !== groupLevels[0]) ? cur : groupLevels[1])
    }
  }, [groupLevels])

  const data = useMemo<TwoProportionData | null>(() => {
    if (sourceMode === 'manual') {
      const n1 = parseInt(manualN1, 10), s1 = parseInt(manualS1, 10)
      const n2 = parseInt(manualN2, 10), s2 = parseInt(manualS2, 10)
      if (![n1, s1, n2, s2].every(Number.isFinite)) return null
      if (n1 <= 0 || n2 <= 0 || s1 < 0 || s2 < 0 || s1 > n1 || s2 > n2) return null
      const lbl1 = manualLabel1.trim() || 'Group 1'
      const lbl2 = manualLabel2.trim() || 'Group 2'
      return buildTwoProportionData(n1, s1, n2, s2, lbl1, lbl2, 'Success', 'Failure')
    }
    if (!config.var1ColId || !config.var2ColId || !successLevel || !groupA || !groupB) return null
    let n1 = 0, s1 = 0, n2 = 0, s2 = 0
    for (const row of grid.rows) {
      const response = String(row[config.var1ColId] ?? '').trim()
      const group    = String(row[config.var2ColId] ?? '').trim()
      if (!response || !group) continue
      if (group === groupA)      { n1++; if (response === successLevel) s1++ }
      else if (group === groupB) { n2++; if (response === successLevel) s2++ }
    }
    if (n1 === 0 || n2 === 0) return null
    return buildTwoProportionData(n1, s1, n2, s2, groupA, groupB, successLevel, 'Not Success')
  }, [config.var1ColId, config.var2ColId, grid.rows, groupA, groupB, manualN1, manualN2, manualS1, manualS2, manualLabel1, manualLabel2, sourceMode, successLevel])

  const cases    = data?.cases ?? []
  const layout   = getCardLayout(Math.max(1, cases.length))
  // isAnimating is true only during pure-animation stages (not pause stages)
  const isAnimating = stage === 'pooling' || stage === 'reassigning' || stage === 'plotting'
  const pValue   = simCount > 0 ? extremeCount / simCount : null
  const positions = data ? computePositions(data, stage, assignment) : new Map<number, CardPos>()

  const dataRef   = useRef(data)
  const altRef    = useRef(alternative)
  const resultRef = useRef<TwoProportionResult | null>(null)
  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { altRef.current  = alternative }, [alternative])

  // Reset simulation when data/config changes
  useEffect(() => {
    setStage('observed')
    setAssignment([])
    setCurrentResult(null)
    setNullDist([])
    setSimCount(0)
    setExtremeCount(0)
    setHighlightSim(false)
  }, [data, sourceMode, nullDiff, alternative])

  // ── Stage machine — only auto-advances animation stages; pauses at pooled/computing/done ──
  useEffect(() => {
    if (!isAnimating) return
    if (!dataRef.current) return
    let id: ReturnType<typeof setTimeout>

    if (stage === 'pooling') {
      // Cards fly to pile → pause at 'pooled'
      id = setTimeout(() => setStage('pooled'), ANIM_DUR + 80)

    } else if (stage === 'reassigning') {
      // Cards deal out → pause at 'computing' with stats highlighted
      id = setTimeout(() => {
        setHighlightSim(true)
        setStage('computing')
      }, ANIM_DUR + STAGGER + 100)

    } else if (stage === 'plotting') {
      // Record dot on null dist → pause at 'done'
      id = setTimeout(() => {
        const result = resultRef.current
        if (result && dataRef.current) {
          setNullDist(prev => [...prev, result.diffSim])
          setSimCount(prev => prev + 1)
          if (isExtremeResult(result.diffSim, dataRef.current.diffObs, altRef.current))
            setExtremeCount(prev => prev + 1)
        }
        setStage('done')
      }, 300)
    }

    return () => clearTimeout(id)
  }, [stage, isAnimating])

  // ── Step handler — manual advance through pause stages ──────────────────────
  function handleStep() {
    if (isAnimating || !data) return
    if (stage === 'observed' || stage === 'done') {
      // Step 1: Pool all cards
      setStage('pooling')
    } else if (stage === 'pooled') {
      // Step 2: Run randomization and deal cards
      const result = runTwoProportionRandomization(data)
      resultRef.current = result
      setAssignment(result.assignment)
      setCurrentResult(result)
      setStage('reassigning')
    } else if (stage === 'computing') {
      // Step 3: Record on null distribution
      setHighlightSim(false)
      setStage('plotting')
    }
  }

  function runBatch(count: number) {
    if (!data) return
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
    const last = runTwoProportionRandomization(data)
    setAssignment(last.assignment)
    setCurrentResult(last)
    setStage('done')
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

  function handleLaunch() {
    handleReset()
    setSimLaunched(true)
  }

  // Derived
  const showSplit      = stage !== 'pooled' && stage !== 'reassigning' && stage !== 'pooling'
  const showCenter     = stage === 'pooled' || stage === 'reassigning' || stage === 'pooling'
  const showRandomized = stage === 'computing' || stage === 'plotting' || stage === 'done'
  const leftStats      = data ? colStats(cases, 0, showRandomized ? assignment : null, stage) : { n: 0, s: 0, p: 0 }
  const rightStats     = data ? colStats(cases, 1, showRandomized ? assignment : null, stage) : { n: 0, s: 0, p: 0 }
  const leftLabel      = data?.group1Label  ?? 'Group 1'
  const rightLabel     = data?.group2Label  ?? 'Group 2'
  const successLabel   = data?.successLabel ?? 'Success'
  const failureLabel   = data?.failureLabel ?? 'Failure'
  const altSymbol      = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement   = `p₁ − p₂ ${altSymbol} ${nullDiff}`

  const stepLabel = isAnimating ? 'Animating…' : (STEP_LABELS[stage] ?? 'Step')

  return (
    <div className="space-y-4">

      {/* ── Config card ───────────────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">

        {/* Source mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Source</span>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {([['data', 'Use Data'], ['manual', 'Enter Info']] as [SourceMode, string][]).map(([m, lbl], i) => (
              <button key={m} onClick={() => setSourceMode(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${sourceMode === m ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {sourceMode === 'data' ? (
          <>
            <div className="flex gap-2">
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
                <DropZone id={`${cardId}:var1`} label="Response Variable" hint="categorical only" assignedCol={responseCol} onClear={() => onClearZone('var1')} />
              </div>
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
                <DropZone id={`${cardId}:var2`} label="2nd Variable or Group By" hint="categorical only" assignedCol={groupCol} onClear={() => onClearZone('var2')} />
              </div>
            </div>
            {responseLevels.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
                <select value={successLevel} onChange={e => setSuccessLevel(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                  {responseLevels.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
            )}
            {groupLevels.length > 2 && (
              <div className="flex gap-2">
                {([['Compare', groupA, setGroupA, groupB], ['vs.', groupB, setGroupB, groupA]] as [string, string, (v:string)=>void, string][]).map(([lbl, val, setter, other]) => (
                  <div key={lbl} className="flex-1 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                    <select value={val} onChange={e => setter(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                      {groupLevels.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* ── Enter Info: fraction layout ──────────────────────────────────── */
          <div className="space-y-4">
            {/* Group labels */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Group 1 name</label>
                <input value={manualLabel1} onChange={e => setManualLabel1(e.target.value)} placeholder="Group 1"
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-white text-[var(--color-text)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Group 2 name</label>
                <input value={manualLabel2} onChange={e => setManualLabel2(e.target.value)} placeholder="Group 2"
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-white text-[var(--color-text)]" />
              </div>
            </div>

            {/* Fractions */}
            <div className="flex items-center justify-around py-1">
              <FractionInput label="p̂₁" numLabel="x₁" denLabel="n₁"
                numValue={manualS1} denValue={manualN1}
                onChangeNum={setManualS1} onChangeDen={setManualN1} />
              <div className="w-px h-20 bg-[var(--color-border)]" />
              <FractionInput label="p̂₂" numLabel="x₂" denLabel="n₂"
                numValue={manualS2} denValue={manualN2}
                onChangeNum={setManualS2} onChangeDen={setManualN2} />
            </div>

            {/* Computed difference */}
            {data && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-2.5 text-center">
                <span className="text-sm text-[var(--color-muted)]">
                  p̂₁ − p̂₂ = {data.p1.toFixed(3)} − {data.p2.toFixed(3)} ={' '}
                </span>
                <span className="text-sm font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        {/* Hypotheses */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₀: p₁ − p₂ =</span>
            <input type="number" min={-1} max={1} step={0.01} value={nullDiff} onChange={e => setNullDiff(e.target.value)}
              disabled={isAnimating}
              className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₁</span>
            <select value={alternative} onChange={e => setAlternative(e.target.value as Alternative)} disabled={isAnimating}
              className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
              <option value="less">&lt;</option>
              <option value="greater">&gt;</option>
              <option value="two">≠</option>
            </select>
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">{altStatement}</span>
          </div>

          <button
            onClick={handleLaunch}
            disabled={!data}
            className="ml-auto rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {simLaunched ? 'Re-launch Simulation' : 'Launch Simulation →'}
          </button>
        </div>
      </div>

      {/* ── Simulation panel (shown after launch) ─────────────────────────────── */}
      {simLaunched && (
        <div className="space-y-4">

          {/* Main layout */}
          <div className="flex flex-col xl:flex-row gap-4">

            {/* Animation canvas */}
            <div className="flex-shrink-0 rounded-2xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
              {/* Column headers */}
              <div className="relative border-b border-[var(--color-border)] bg-slate-50 px-4 py-2" style={{ width: CANVAS_W }}>
                <span style={{ position: 'absolute', left: COL_CX.left,   transform: 'translateX(-50%)', bottom: 8, fontSize: 12, fontWeight: 600 }}>{leftLabel}</span>
                {showCenter && (
                  <span style={{ position: 'absolute', left: COL_CX.center, transform: 'translateX(-50%)', bottom: 8, fontSize: 12, color: 'var(--color-muted)' }}>Pooled</span>
                )}
                <span style={{ position: 'absolute', left: COL_CX.right,  transform: 'translateX(-50%)', bottom: 8, fontSize: 12, fontWeight: 600 }}>{rightLabel}</span>
                <div style={{ height: 20 }} />
              </div>

              {/* Card area */}
              <div className="relative bg-white" style={{ width: CANVAS_W, height: CANVAS_H }}>
                <div className="absolute inset-y-0" style={{
                  left: COL_CX.left - COL_W/2 - 4, width: COL_W + 8,
                  background: showSplit ? 'rgba(14,165,160,0.03)' : 'transparent',
                  borderRight: showSplit ? '1px dashed rgba(14,165,160,0.15)' : 'none',
                  transition: 'background 400ms',
                }} />
                <div className="absolute inset-y-0" style={{
                  left: COL_CX.right - COL_W/2 - 4, width: COL_W + 8,
                  background: showSplit ? 'rgba(14,165,160,0.03)' : 'transparent',
                  borderLeft: showSplit ? '1px dashed rgba(14,165,160,0.15)' : 'none',
                  transition: 'background 400ms',
                }} />

                {cases.map(c => {
                  const p        = positions.get(c.id) ?? { x: -50, y: -50, rotation: 0, delay: 0, faceDown: false }
                  const isSuccess = c.response === 1
                  const fd        = p.faceDown
                  const bg        = fd ? '#1A8C80' : isSuccess ? '#2EC4B6' : '#E2E8F0'
                  const bdr       = fd ? '#0D6B63' : isSuccess ? '#1A8C80' : '#CBD5E1'
                  const bdrPx     = Math.max(1, Math.floor(layout.w / 14))
                  const radius    = Math.max(2, Math.floor(layout.w / 7))
                  return (
                    <div key={c.id} style={{
                      position: 'absolute', left: p.x, top: p.y,
                      width: layout.w, height: layout.h,
                      transition: `left ${ANIM_DUR}ms ease-in-out, top ${ANIM_DUR}ms ease-in-out, transform ${ANIM_DUR}ms ease-in-out, background-color 180ms, border-color 180ms`,
                      transitionDelay: `${p.delay}ms`,
                      transform: `rotate(${p.rotation}deg)`,
                      borderRadius: radius,
                      backgroundColor: bg,
                      border: `${bdrPx}px solid ${bdr}`,
                      boxShadow: fd ? '0 2px 4px rgba(0,0,0,0.18)' : '0 1px 2px rgba(0,0,0,0.10)',
                      boxSizing: 'border-box',
                    }} aria-label={isSuccess ? successLabel : failureLabel} />
                  )
                })}

                {data && showSplit && (
                  <>
                    <ColStatLabel cx={COL_CX.left}  n={showRandomized ? leftStats.n  : data.n1} s={showRandomized ? leftStats.s  : data.s1} p={showRandomized ? leftStats.p  : data.p1} highlight={highlightSim && showRandomized} layout={layout} />
                    <ColStatLabel cx={COL_CX.right} n={showRandomized ? rightStats.n : data.n2} s={showRandomized ? rightStats.s : data.s2} p={showRandomized ? rightStats.p : data.p2} highlight={highlightSim && showRandomized} layout={layout} />
                  </>
                )}
              </div>

              {/* Caption */}
              <div className="border-t border-[var(--color-border)] bg-slate-50 px-4 py-2.5" style={{ width: CANVAS_W }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="inline-block rounded-sm bg-[#2EC4B6] flex-shrink-0" style={{ width: 9, height: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                    {data?.successLabel ?? 'Success'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="inline-block rounded-sm bg-[#E2E8F0] border border-[#CBD5E1] flex-shrink-0" style={{ width: 9, height: 14 }} />
                    {data?.failureLabel ?? 'Failure'}
                  </div>
                  <span className="ml-auto text-xs italic text-[var(--color-muted)]">{CAPTIONS[stage]}</span>
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">

              {/* Observed stats */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Observed Data</div>
                {data ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatCell label={data.group1Label} value={`p̂₁ = ${data.p1.toFixed(3)}`} sub={`${data.s1} / ${data.n1}`} />
                    <StatCell label={data.group2Label} value={`p̂₂ = ${data.p2.toFixed(3)}`} sub={`${data.s2} / ${data.n2}`} />
                    <StatCell label="Observed diff" value={data.diffObs.toFixed(3)} sub="p̂₁ − p̂₂" accent />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-20 text-xs text-[var(--color-muted)]">No valid data</div>
                )}
              </div>

              {/* Current simulation */}
              {currentResult && data && (
                <div className={`rounded-2xl border shadow-sm p-4 space-y-3 transition-colors ${highlightSim ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)] bg-white'}`}>
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                    Simulation #{simCount + (stage === 'done' ? 0 : 1)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatCell label={data.group1Label} value={`p̂₁ = ${currentResult.p1Sim.toFixed(3)}`} sub={`${currentResult.s1Sim} / ${data.n1}`} />
                    <StatCell label={data.group2Label} value={`p̂₂ = ${currentResult.p2Sim.toFixed(3)}`} sub={`${currentResult.s2Sim} / ${data.n2}`} />
                    <StatCell label="Simulated diff" value={currentResult.diffSim.toFixed(3)}
                      sub={isExtremeResult(currentResult.diffSim, data.diffObs, alternative) ? '★ extreme' : 'not extreme'}
                      accent={isExtremeResult(currentResult.diffSim, data.diffObs, alternative)} />
                  </div>
                </div>
              )}

              {/* Null distribution */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</div>
                  <div className="text-xs text-[var(--color-muted)]">{simCount} simulation{simCount !== 1 ? 's' : ''}</div>
                </div>
                {simCount === 0 ? (
                  <div className="flex items-center justify-center h-32 text-xs text-[var(--color-muted)]">Run simulations to build the null distribution</div>
                ) : (
                  <NullDistPlot values={nullDist} diffObs={data!.diffObs} alternative={alternative} />
                )}
                <div className="flex items-center gap-3 pt-1 border-t border-[var(--color-border)]">
                  <div className="text-xs text-[var(--color-muted)]">
                    Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span>{' / '}{simCount}
                  </div>
                  <div className="ml-auto text-sm font-bold text-[var(--color-accent)]">
                    {pValue !== null ? `p ≈ ${pValue < 0.001 ? '< 0.001' : pValue.toFixed(4)}` : 'p = —'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
            <button onClick={handleStep} disabled={isAnimating || !data}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              {stepLabel}
            </button>

            <div className="w-px h-6 bg-[var(--color-border)] mx-1" />

            {[1, 10, 100, 1000].map(n => (
              <button key={n} onClick={() => runBatch(n)} disabled={isAnimating || !data}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Run {n.toLocaleString()}
              </button>
            ))}

            <button onClick={handleReset} disabled={isAnimating}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Reset
            </button>

            {data && (
              <div className="ml-auto text-xs text-[var(--color-muted)] space-x-3">
                <span>n₁ = {data.n1}</span>
                <span>n₂ = {data.n2}</span>
                <span>Total = {cases.length}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FractionInput({
  label, numLabel, denLabel, numValue, denValue, onChangeNum, onChangeDen,
}: {
  label: string; numLabel: string; denLabel: string
  numValue: string; denValue: string
  onChangeNum: (v: string) => void; onChangeDen: (v: string) => void
}) {
  const num  = parseInt(numValue, 10)
  const den  = parseInt(denValue, 10)
  const phat = (Number.isFinite(num) && Number.isFinite(den) && den > 0 && num >= 0 && num <= den)
    ? (num / den).toFixed(3) : '—'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* p̂₁ = x₁/n₁ header */}
      <div className="text-center">
        <span className="text-base font-bold text-[var(--color-text)]">{label}</span>
        <span className="text-xs text-[var(--color-muted)] ml-1">= {numLabel}/{denLabel}</span>
      </div>

      {/* Fraction with row labels */}
      <div className="flex items-center gap-1.5">
        {/* x₁ / n₁ labels column */}
        <div className="flex flex-col items-end gap-1 text-xs font-mono text-[var(--color-muted)]" style={{ paddingBottom: 2 }}>
          <span className="py-1.5">{numLabel}</span>
          <span className="py-1.5">{denLabel}</span>
        </div>
        {/* Fraction */}
        <div className="flex flex-col items-center">
          <input type="number" min={0} step={1} value={numValue} onChange={e => onChangeNum(e.target.value)}
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
          <div className="my-0.5 w-[4.5rem] border-t-2 border-[var(--color-text)]" />
          <input type="number" min={1} step={1} value={denValue} onChange={e => onChangeDen(e.target.value)}
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
        </div>
      </div>

      {/* Computed value */}
      <div className="text-sm text-[var(--color-muted)]">
        = <span className="font-bold text-[var(--color-text)]">{phat}</span>
      </div>
    </div>
  )
}

function StatCell({ label, value, sub, accent = false }: {
  label: string; value: string; sub: string; accent?: boolean
}) {
  return (
    <div className={`rounded-xl p-2 ${accent ? 'bg-[var(--color-accent-light)]' : 'bg-slate-50 border border-slate-100'}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] truncate">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>{value}</div>
      <div className="text-[10px] text-[var(--color-muted)]">{sub}</div>
    </div>
  )
}

function ColStatLabel({ cx, n, s, p, highlight, layout }: {
  cx: number; n: number; s: number; p: number; highlight: boolean; layout: CardLayout
}) {
  const rows = Math.ceil(n / Math.max(1, layout.perRow))
  const top  = HEADER_H + rows * layout.stepY + 8
  return (
    <div style={{ position: 'absolute', left: cx, top, transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
      <div className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${highlight ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)]'}`}>
        {s}/{n} = {p.toFixed(3)}
      </div>
    </div>
  )
}
