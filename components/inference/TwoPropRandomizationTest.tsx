'use client'

import { createPortal } from 'react-dom'
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

// ── Stage type ────────────────────────────────────────────────────────────────
// Pause stages (Step button enabled): observed, pooled, shuffled, reassigned, computing, done
// Anim  stages (Step button disabled): pooling, shuffling, reassigning, plotting

type Stage =
  | 'observed'    // pause — initial
  | 'pooling'     // anim  — cards fly to center pile
  | 'pooled'      // pause — pile visible (Step 1 done)
  | 'shuffling'   // anim  — pile scatters to new arrangement
  | 'shuffled'    // pause — new pile arrangement (Step 2 done)
  | 'reassigning' // anim  — cards deal face-down to columns
  | 'reassigned'  // pause — face-down assignment visible (Step 3 done)
  | 'computing'   // pause — cards flip face-up, stats highlighted (Step 4 done)
  | 'plotting'    // anim  — dot drops onto null distribution
  | 'done'        // pause — cycle complete (Step 5 done)

// ── Card layout types ─────────────────────────────────────────────────────────

interface CardLayout {
  w: number; h: number; stepX: number; stepY: number; perRow: number
}

interface CardPos {
  x: number; y: number; rotation: number; delay: number; faceDown: boolean
}

// ── Canvas constants ──────────────────────────────────────────────────────────

const CANVAS_W = 480
const CANVAS_H = 300
const HEADER_H = 42
const COL_W    = 116
const ANIM_DUR = 480
const STAGGER  = 140

const COL_CX = { left: 72, center: 240, right: 408 }
const PILE_CY = HEADER_H + (CANVAS_H - HEADER_H) / 2

function getCardLayout(n: number): CardLayout {
  const w = n <= 20 ? 22 : n <= 40 ? 16 : n <= 80 ? 12 : n <= 160 ? 9 : 7
  const h = Math.ceil(w * 1.55)
  const gap = 2
  return { w, h, stepX: w + gap, stepY: h + gap, perRow: Math.max(1, Math.floor(COL_W / (w + gap))) }
}

// Deterministic card hash for stable jitter/rotation
function cardHash(id: number, salt = 0): number {
  return (((id + 1) * 2654435761 + salt * 40503) >>> 0) / 4294967296
}

function getSlotXY(idx: number, colCx: number, layout: CardLayout, groupSize: number) {
  const cols    = Math.min(layout.perRow, groupSize)
  const offsetX = colCx - (cols * layout.stepX) / 2
  return { x: offsetX + (idx % cols) * layout.stepX, y: HEADER_H + Math.floor(idx / cols) * layout.stepY }
}

// ── Position computation ──────────────────────────────────────────────────────

function computePositions(data: TwoProportionData, stage: Stage, assignment: number[]): Map<number, CardPos> {
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

  // Pooled pile (original arrangement)
  if (stage === 'pooling' || stage === 'pooled') {
    cases.forEach(c => {
      pos.set(c.id, {
        x: COL_CX.center - layout.w/2 + (cardHash(c.id, 0) - 0.5) * 12,
        y: PILE_CY        - layout.h/2 + (cardHash(c.id, 1) - 0.5) * 8,
        rotation: (cardHash(c.id, 2) - 0.5) * 40,
        delay: 0, faceDown: true,
      })
    })
    return pos
  }

  // Shuffled pile (wider scatter → new arrangement, different salts)
  if (stage === 'shuffling' || stage === 'shuffled') {
    cases.forEach((c, i) => {
      pos.set(c.id, {
        x: COL_CX.center - layout.w/2 + (cardHash(c.id, 6) - 0.5) * 20,
        y: PILE_CY        - layout.h/2 + (cardHash(c.id, 7) - 0.5) * 14,
        rotation: (cardHash(c.id, 8) - 0.5) * 56,
        // staggered: cards shuffle one by one
        delay: stage === 'shuffling' ? cardHash(c.id, 11) * 120 : 0,
        faceDown: true,
      })
    })
    return pos
  }

  // Reassigning: cards deal face-down to columns with stagger
  if (stage === 'reassigning') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    g1Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:(i/n)*STAGGER,faceDown:true}) })
    g2Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:((n1+i)/n)*STAGGER,faceDown:true}) })
    return pos
  }

  // Reassigned: same slots, still face-down
  if (stage === 'reassigned') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    g1Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    g2Sim.forEach((c, i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    return pos
  }

  // computing / plotting / done: face-up in their slots
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
  const SVG_W = 320, SVG_H = 160
  const MG = { t: 14, r: 8, b: 30, l: 8 }
  const PW = SVG_W - MG.l - MG.r, PH = SVG_H - MG.t - MG.b
  const xOf = (v: number) => ((v + 1) / 2) * PW

  const seenC2 = new Map<number, number>()
  const maxStack = (() => {
    const m = new Map<number, number>()
    values.forEach(v => { const b = Math.round(v/BUCKET)*BUCKET; m.set(b, (m.get(b)??0)+1) })
    return Math.max(1, ...Array.from(m.values()))
  })()
  const dotStep = Math.max(1.5, Math.min(7, PH / maxStack))
  const dotR    = Math.max(1, dotStep / 2 - 0.3)

  const circles: { cx: number; cy: number; extreme: boolean }[] = []
  for (const v of values) {
    const b  = Math.round(v/BUCKET)*BUCKET
    const si = seenC2.get(b) ?? 0
    seenC2.set(b, si + 1)
    circles.push({ cx: xOf(b), cy: PH - si * dotStep - dotR, extreme: isExtremeResult(v, diffObs, alternative) })
  }

  const obsX = xOf(diffObs)
  let shadePath = ''
  if (alternative === 'greater') shadePath = `M${obsX},0 H${PW} V${PH} H${obsX} Z`
  else if (alternative === 'less') shadePath = `M0,0 H${obsX} V${PH} H0 Z`
  else { const xL = xOf(-Math.abs(diffObs)), xR = xOf(Math.abs(diffObs)); shadePath = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z` }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop { from{transform:translateY(-30px);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH} /></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shadePath} fill="#0EA5A0" opacity={0.10} />
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5} />
        {[-1,-0.5,0,0.5,1].map(v => (
          <g key={v} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="#CBD5E1" strokeWidth={1} />
            <text y={12} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="DM Sans,sans-serif">{v.toFixed(1)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circles.map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR} fill={c.extreme ? '#0EA5A0' : '#94A3B8'} opacity={0.85}
              style={i === circles.length-1 && values.length > 0 ? {animation:'dot-drop 250ms ease-out'} : undefined} />
          ))}
        </g>
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3" />
        <text x={obsX+(diffObs>=0?3:-3)} y={5} textAnchor={diffObs>=0?'start':'end'} fontSize={8} fill="#EF4444" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        <text x={PW/2} y={PH+24} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans,sans-serif">Simulated p̂₁ − p̂₂</text>
      </g>
    </svg>
  )
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: { label: string; stages: Stage[] }[] = [
  { label: '1. Pool',     stages: ['observed', 'done'] },
  { label: '2. Shuffle',  stages: ['pooled'] },
  { label: '3. Reassign', stages: ['shuffled'] },
  { label: '4. Compute',  stages: ['reassigned'] },
  { label: '5. Record',   stages: ['computing'] },
]

const CAPTIONS: Record<Stage, string> = {
  observed:   'Observed data',
  pooling:    'Pooling cases…',
  pooled:     'Pooled — ready to shuffle',
  shuffling:  'Shuffling…',
  shuffled:   'Shuffled — ready to reassign',
  reassigning:'Dealing cards to groups…',
  reassigned: 'Assigned (face-down) — ready to compute',
  computing:  'Simulated proportions revealed',
  plotting:   'Recording on null distribution…',
  done:       'Done',
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function colStats(cases: TwoProportionData['cases'], group: 0|1, assignment: number[]|null, stage: Stage) {
  const useObs = stage === 'observed' || stage === 'pooling'
  let members: typeof cases
  if (useObs) members = cases.filter(c => c.group === group)
  else if (assignment) {
    const aSet = new Set(assignment)
    members = group === 0 ? cases.filter(c => aSet.has(c.id)) : cases.filter(c => !aSet.has(c.id))
  } else return { n:0,s:0,p:0 }
  const n = members.length, s = members.filter(c => c.response === 1).length
  return { n, s, p: n > 0 ? s/n : 0 }
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
  const [mounted, setMounted]           = useState(false)

  // Config
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
  const [simOpen, setSimOpen]           = useState(false)

  // Simulation
  const [stage, setStage]               = useState<Stage>('observed')
  const [assignment, setAssignment]     = useState<number[]>([])
  const [currentResult, setCurrentResult] = useState<TwoProportionResult | null>(null)
  const [nullDist, setNullDist]         = useState<number[]>([])
  const [simCount, setSimCount]         = useState(0)
  const [extremeCount, setExtremeCount] = useState(0)
  const [highlightSim, setHighlightSim] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Drop zones
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

  const responseLevels = useMemo(() =>
    config.var1ColId ? [...new Set(grid.rows.map(r => String(r[config.var1ColId!]??'').trim()).filter(Boolean))].sort() : [],
    [grid.rows, config.var1ColId])

  const groupLevels = useMemo(() =>
    config.var2ColId ? [...new Set(grid.rows.map(r => String(r[config.var2ColId!]??'').trim()).filter(Boolean))].sort() : [],
    [grid.rows, config.var2ColId])

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
      const n1 = parseInt(manualN1,10), s1 = parseInt(manualS1,10)
      const n2 = parseInt(manualN2,10), s2 = parseInt(manualS2,10)
      if (![n1,s1,n2,s2].every(Number.isFinite) || n1<=0||n2<=0||s1<0||s2<0||s1>n1||s2>n2) return null
      return buildTwoProportionData(n1,s1,n2,s2, manualLabel1.trim()||'Group 1', manualLabel2.trim()||'Group 2', 'Success','Failure')
    }
    if (!config.var1ColId || !config.var2ColId || !successLevel || !groupA || !groupB) return null
    let n1=0,s1=0,n2=0,s2=0
    for (const row of grid.rows) {
      const resp = String(row[config.var1ColId]??'').trim()
      const grp  = String(row[config.var2ColId]??'').trim()
      if (!resp||!grp) continue
      if (grp===groupA) { n1++; if(resp===successLevel) s1++ }
      else if (grp===groupB) { n2++; if(resp===successLevel) s2++ }
    }
    if (n1===0||n2===0) return null
    return buildTwoProportionData(n1,s1,n2,s2, groupA, groupB, successLevel, 'Not Success')
  }, [config.var1ColId,config.var2ColId,grid.rows,groupA,groupB,manualN1,manualN2,manualS1,manualS2,manualLabel1,manualLabel2,sourceMode,successLevel])

  const cases     = data?.cases ?? []
  const layout    = getCardLayout(Math.max(1, cases.length))
  const isAnimating = ['pooling','shuffling','reassigning','plotting'].includes(stage)
  const pValue    = simCount > 0 ? extremeCount / simCount : null
  const positions = data ? computePositions(data, stage, assignment) : new Map<number,CardPos>()

  const dataRef   = useRef(data)
  const altRef    = useRef(alternative)
  const resultRef = useRef<TwoProportionResult|null>(null)
  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { altRef.current  = alternative }, [alternative])

  // Reset when config changes
  useEffect(() => {
    setStage('observed'); setAssignment([]); setCurrentResult(null)
    setNullDist([]); setSimCount(0); setExtremeCount(0); setHighlightSim(false)
  }, [data, sourceMode, nullDiff, alternative])

  // ── Stage machine (anim stages only; pause stages wait for handleStep) ──────
  useEffect(() => {
    if (!isAnimating || !dataRef.current) return
    let id: ReturnType<typeof setTimeout>

    if (stage === 'pooling') {
      id = setTimeout(() => setStage('pooled'), ANIM_DUR + 80)
    } else if (stage === 'shuffling') {
      // Wait for staggered shuffle animation (max 120ms delay + ANIM_DUR travel)
      id = setTimeout(() => setStage('shuffled'), ANIM_DUR + 160)
    } else if (stage === 'reassigning') {
      id = setTimeout(() => setStage('reassigned'), ANIM_DUR + STAGGER + 100)
    } else if (stage === 'plotting') {
      id = setTimeout(() => {
        const result = resultRef.current
        if (result && dataRef.current) {
          setNullDist(prev => [...prev, result.diffSim])
          setSimCount(prev => prev + 1)
          if (isExtremeResult(result.diffSim, dataRef.current.diffObs, altRef.current))
            setExtremeCount(prev => prev + 1)
        }
        setStage('done')
      }, 320)
    }
    return () => clearTimeout(id)
  }, [stage, isAnimating])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleStep() {
    if (isAnimating || !data) return
    if (stage === 'observed' || stage === 'done') {
      setStage('pooling')
    } else if (stage === 'pooled') {
      setStage('shuffling')
    } else if (stage === 'shuffled') {
      const result = runTwoProportionRandomization(data)
      resultRef.current = result
      setAssignment(result.assignment)
      setCurrentResult(result)
      setStage('reassigning')
    } else if (stage === 'reassigned') {
      setHighlightSim(true)
      setStage('computing')
    } else if (stage === 'computing') {
      setHighlightSim(false)
      setStage('plotting')
    }
  }

  function runBatch(count: number) {
    if (!data) return
    const diffs: number[] = []; let newExtreme = 0
    for (let i = 0; i < count; i++) {
      const r = runTwoProportionRandomization(data)
      diffs.push(r.diffSim)
      if (isExtremeResult(r.diffSim, data.diffObs, alternative)) newExtreme++
    }
    setNullDist(prev => [...prev, ...diffs])
    setSimCount(prev => prev + count)
    setExtremeCount(prev => prev + newExtreme)
    const last = runTwoProportionRandomization(data)
    setAssignment(last.assignment); setCurrentResult(last); setStage('done')
  }

  function handleReset() {
    setStage('observed'); setAssignment([]); setCurrentResult(null)
    setNullDist([]); setSimCount(0); setExtremeCount(0); setHighlightSim(false)
  }

  function handleLaunch() { handleReset(); setSimOpen(true) }

  // Derived
  const POOL_STAGES: Stage[] = ['pooling','pooled','shuffling','shuffled','reassigning']
  const showSplit      = !POOL_STAGES.includes(stage)
  const showCenter     = POOL_STAGES.includes(stage)
  const showFaceUp     = ['computing','plotting','done'].includes(stage)
  const showColStats   = showSplit && showFaceUp
  const leftStats      = data ? colStats(cases, 0, showFaceUp ? assignment : null, stage) : {n:0,s:0,p:0}
  const rightStats     = data ? colStats(cases, 1, showFaceUp ? assignment : null, stage) : {n:0,s:0,p:0}
  const leftLabel      = data?.group1Label  ?? 'Group 1'
  const rightLabel     = data?.group2Label  ?? 'Group 2'
  const successLabel   = data?.successLabel ?? 'Success'
  const failureLabel   = data?.failureLabel ?? 'Failure'
  const altSymbol      = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement   = `p₁ − p₂ ${altSymbol} ${nullDiff}`

  // ── Simulation modal ───────────────────────────────────────────────────────
  const simModal = simOpen && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,27,45,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) setSimOpen(false) }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden"
           style={{ width: 'min(920px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)' }}>

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm text-[var(--color-text)]">Two-Proportion Randomization</span>
            {data && (
              <span className="text-xs text-[var(--color-muted)]">
                {leftLabel}: {data.s1}/{data.n1} &nbsp;·&nbsp; {rightLabel}: {data.s2}/{data.n2}
              </span>
            )}
          </div>
          <button onClick={() => setSimOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-slate-200 hover:text-[var(--color-text)] text-lg leading-none transition-colors">
            ×
          </button>
        </div>

        {/* Content: canvas + stats panel */}
        <div className="flex gap-0 flex-1 min-h-0">

          {/* ── Animation canvas ── */}
          <div className="flex-shrink-0 flex flex-col border-r border-[var(--color-border)]">
            {/* Column headers */}
            <div className="relative bg-slate-50 border-b border-[var(--color-border)] flex-shrink-0"
                 style={{ width: CANVAS_W, height: HEADER_H }}>
              <span style={{ position:'absolute', left:COL_CX.left,   top:'50%', transform:'translate(-50%,-50%)', fontSize:11, fontWeight:600, color:'var(--color-text)' }}>{leftLabel}</span>
              {showCenter && <span style={{ position:'absolute', left:COL_CX.center, top:'50%', transform:'translate(-50%,-50%)', fontSize:11, color:'var(--color-muted)' }}>Pooled</span>}
              <span style={{ position:'absolute', left:COL_CX.right,  top:'50%', transform:'translate(-50%,-50%)', fontSize:11, fontWeight:600, color:'var(--color-text)' }}>{rightLabel}</span>
            </div>

            {/* Cards */}
            <div className="relative bg-white flex-shrink-0" style={{ width: CANVAS_W, height: CANVAS_H }}>
              {/* Column zone backgrounds */}
              <div className="absolute inset-y-0 transition-all duration-500" style={{
                left: COL_CX.left - COL_W/2 - 4, width: COL_W + 8,
                background: showSplit ? 'rgba(14,165,160,0.04)' : 'transparent',
                borderRight: showSplit ? '1px dashed rgba(14,165,160,0.2)' : 'none',
              }} />
              <div className="absolute inset-y-0 transition-all duration-500" style={{
                left: COL_CX.right - COL_W/2 - 4, width: COL_W + 8,
                background: showSplit ? 'rgba(14,165,160,0.04)' : 'transparent',
                borderLeft: showSplit ? '1px dashed rgba(14,165,160,0.2)' : 'none',
              }} />

              {cases.map(c => {
                const p  = positions.get(c.id) ?? { x:-50, y:-50, rotation:0, delay:0, faceDown:false }
                const fd = p.faceDown
                const isSuccess = c.response === 1
                const bg  = fd ? '#1A8C80' : isSuccess ? '#2EC4B6' : '#E2E8F0'
                const bdr = fd ? '#0D6B63' : isSuccess ? '#1A8C80' : '#CBD5E1'
                return (
                  <div key={c.id} style={{
                    position:'absolute', left:p.x, top:p.y,
                    width:layout.w, height:layout.h,
                    transition:`left ${ANIM_DUR}ms ease-in-out,top ${ANIM_DUR}ms ease-in-out,transform ${ANIM_DUR}ms ease-in-out,background-color 160ms,border-color 160ms`,
                    transitionDelay:`${p.delay}ms`,
                    transform:`rotate(${p.rotation}deg)`,
                    borderRadius: Math.max(2, Math.floor(layout.w/7)),
                    backgroundColor: bg, border:`${Math.max(1,Math.floor(layout.w/14))}px solid ${bdr}`,
                    boxShadow: fd ? '0 2px 5px rgba(0,0,0,0.20)' : '0 1px 2px rgba(0,0,0,0.10)',
                    boxSizing:'border-box',
                  }} aria-label={isSuccess ? successLabel : failureLabel} />
                )
              })}

              {/* Column stat overlays */}
              {data && showColStats && (
                <>
                  <ColStatLabel cx={COL_CX.left}  n={leftStats.n}  s={leftStats.s}  p={leftStats.p}  highlight={highlightSim} layout={layout} />
                  <ColStatLabel cx={COL_CX.right} n={rightStats.n} s={rightStats.s} p={rightStats.p} highlight={highlightSim} layout={layout} />
                </>
              )}
            </div>

            {/* Caption bar */}
            <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-slate-50 px-3 py-2" style={{ width: CANVAS_W }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <span className="inline-block rounded-sm bg-[#2EC4B6] flex-shrink-0" style={{ width:8, height:13, boxShadow:'0 1px 2px rgba(0,0,0,0.15)' }} />
                  {successLabel}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <span className="inline-block rounded-sm bg-[#E2E8F0] border border-[#CBD5E1] flex-shrink-0" style={{ width:8, height:13 }} />
                  {failureLabel}
                </div>
                <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">{CAPTIONS[stage]}</span>
              </div>
            </div>
          </div>

          {/* ── Stats panel ── */}
          <div className="flex-1 flex flex-col gap-3 p-4 min-h-0 overflow-y-auto">

            {/* Compact observed + sim comparison table */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden flex-shrink-0">
              <div className="grid text-xs" style={{ gridTemplateColumns:'auto 1fr 1fr 1fr' }}>
                {/* Header row */}
                <div className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)]" />
                {[leftLabel, rightLabel, 'p̂₁ − p̂₂'].map(h => (
                  <div key={h} className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)] text-center font-semibold text-[var(--color-muted)] truncate">{h}</div>
                ))}
                {/* Observed row */}
                <div className="px-2 py-1.5 font-semibold text-[var(--color-muted)] border-b border-slate-50 bg-slate-50 text-[10px] flex items-center">Obs.</div>
                <div className="px-2 py-1.5 text-center border-b border-slate-50 text-[var(--color-text)]">
                  {data ? <>{data.s1}/{data.n1}<br/><span className="font-bold">{data.p1.toFixed(3)}</span></> : '—'}
                </div>
                <div className="px-2 py-1.5 text-center border-b border-slate-50 text-[var(--color-text)]">
                  {data ? <>{data.s2}/{data.n2}<br/><span className="font-bold">{data.p2.toFixed(3)}</span></> : '—'}
                </div>
                <div className="px-2 py-1.5 text-center border-b border-slate-50 font-bold text-[var(--color-accent)]">
                  {data ? data.diffObs.toFixed(3) : '—'}
                </div>
                {/* Sim row */}
                {currentResult && data ? (
                  <>
                    <div className={`px-2 py-1.5 text-[10px] font-semibold border-b border-slate-50 flex items-center text-[var(--color-muted)] ${highlightSim ? 'bg-[var(--color-accent-light)]' : ''}`}>Sim.</div>
                    {[
                      { s: currentResult.s1Sim, n: data.n1, p: currentResult.p1Sim },
                      { s: currentResult.s2Sim, n: data.n2, p: currentResult.p2Sim },
                    ].map((cell, i) => (
                      <div key={i} className={`px-2 py-1.5 text-center border-b border-slate-50 text-[var(--color-text)] ${highlightSim ? 'bg-[var(--color-accent-light)]' : ''}`}>
                        {cell.s}/{cell.n}<br/><span className="font-bold">{cell.p.toFixed(3)}</span>
                      </div>
                    ))}
                    <div className={`px-2 py-1.5 text-center border-b border-slate-50 ${highlightSim ? 'bg-[var(--color-accent-light)]' : ''}`}>
                      <span className={`font-bold ${isExtremeResult(currentResult.diffSim, data.diffObs, alternative) ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                        {currentResult.diffSim.toFixed(3)}
                      </span>
                      {isExtremeResult(currentResult.diffSim, data.diffObs, alternative) && <span className="text-[10px] text-[var(--color-accent)] ml-0.5">★</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1.5 text-[10px] text-[var(--color-muted)] opacity-40">Sim.</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-40">—</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-40">—</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-40">—</div>
                  </>
                )}
              </div>
              {/* Simulation count */}
              <div className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-muted)]">Simulation #{simCount > 0 ? simCount : '—'}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{simCount} total</span>
              </div>
            </div>

            {/* H₀ / H₁ summary */}
            <div className="flex-shrink-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-[var(--color-muted)] space-y-0.5">
              <div><span className="font-semibold">H₀:</span> p₁ − p₂ = {nullDiff}</div>
              <div><span className="font-semibold">H₁:</span> {altStatement}</div>
            </div>

            {/* Null distribution */}
            <div className="flex-1 min-h-0 rounded-xl border border-[var(--color-border)] bg-white p-3 flex flex-col" style={{ minHeight: 160 }}>
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              </div>
              <div className="flex-1 min-h-0">
                {simCount === 0
                  ? <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">Run simulations to build distribution</div>
                  : <NullDistPlot values={nullDist} diffObs={data!.diffObs} alternative={alternative} />
                }
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)] flex-shrink-0 mt-1">
                <span className="text-xs text-[var(--color-muted)]">
                  Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span> / {simCount}
                </span>
                <span className="ml-auto text-sm font-bold text-[var(--color-accent)]">
                  {pValue !== null ? `p ≈ ${pValue < 0.001 ? '< 0.001' : pValue.toFixed(4)}` : 'p = —'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-slate-50">
          {/* 5 step buttons */}
          <div className="flex items-center gap-1">
            {STEPS.map(({ label, stages }) => {
              const isCurrentStep = (stages as Stage[]).includes(stage) && !isAnimating && !!data
              return (
                <button key={label} onClick={handleStep} disabled={!isCurrentStep}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${
                    isCurrentStep
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white shadow-sm scale-105'
                      : 'border-[var(--color-border)] text-[var(--color-muted)] opacity-35 cursor-default'
                  }`}>
                  {label}
                </button>
              )
            })}
          </div>

          {isAnimating && <span className="text-xs italic text-[var(--color-muted)]">Animating…</span>}

          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

          {[1, 10, 100, 1000].map(n => (
            <button key={n} onClick={() => runBatch(n)} disabled={isAnimating || !data}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Run {n.toLocaleString()}
            </button>
          ))}

          <button onClick={handleReset} disabled={isAnimating}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Reset
          </button>

          {data && (
            <div className="ml-auto text-[10px] text-[var(--color-muted)] space-x-2">
              <span>n₁={data.n1}</span><span>n₂={data.n2}</span><span>N={cases.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── Config card ───────────────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">

        {/* Source toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Source</span>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {(['data','manual'] as SourceMode[]).map((m, i) => (
              <button key={m} onClick={() => setSourceMode(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${sourceMode===m ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}>
                {m === 'data' ? 'Use Data' : 'Enter Info'}
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
                <DropZone id={`${cardId}:var2`} label="Group By" hint="categorical only" assignedCol={groupCol} onClear={() => onClearZone('var2')} />
              </div>
            </div>
            {responseLevels.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
                <select value={successLevel} onChange={e => setSuccessLevel(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                  {responseLevels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {groupLevels.length > 2 && (
              <div className="flex gap-2">
                {(['Compare','vs.'] as const).map((lbl, idx) => {
                  const [val, setter, other] = idx === 0 ? [groupA, setGroupA, groupB] : [groupB, setGroupB, groupA]
                  return (
                    <div key={lbl} className="flex-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                      <select value={val} onChange={e => setter(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                        {groupLevels.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
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
            <div className="flex items-center justify-around py-1">
              <FractionInput label="p̂₁" numLabel="x₁" denLabel="n₁" numValue={manualS1} denValue={manualN1} onChangeNum={setManualS1} onChangeDen={setManualN1} />
              <div className="w-px h-20 bg-[var(--color-border)]" />
              <FractionInput label="p̂₂" numLabel="x₂" denLabel="n₂" numValue={manualS2} denValue={manualN2} onChangeNum={setManualS2} onChangeDen={setManualN2} />
            </div>
            {data && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-2 text-center text-sm">
                <span className="text-[var(--color-muted)]">p̂₁ − p̂₂ = {data.p1.toFixed(3)} − {data.p2.toFixed(3)} = </span>
                <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        {/* Hypotheses + Launch */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₀: p₁−p₂=</span>
            <input type="number" min={-1} max={1} step={0.01} value={nullDiff} onChange={e => setNullDiff(e.target.value)}
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
          <button onClick={handleLaunch} disabled={!data}
            className="ml-auto rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            {simOpen ? 'Re-launch →' : 'Launch Simulation →'}
          </button>
        </div>
      </div>

      {/* Portal for simulation modal */}
      {mounted && simOpen && createPortal(simModal, document.body)}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FractionInput({ label, numLabel, denLabel, numValue, denValue, onChangeNum, onChangeDen }: {
  label: string; numLabel: string; denLabel: string
  numValue: string; denValue: string
  onChangeNum: (v: string) => void; onChangeDen: (v: string) => void
}) {
  const num = parseInt(numValue, 10), den = parseInt(denValue, 10)
  const phat = (Number.isFinite(num) && Number.isFinite(den) && den > 0 && num >= 0 && num <= den)
    ? (num / den).toFixed(3) : '—'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-center">
        <span className="text-base font-bold text-[var(--color-text)]">{label}</span>
        <span className="text-xs text-[var(--color-muted)] ml-1">= {numLabel}/{denLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col items-end gap-1 text-xs font-mono text-[var(--color-muted)]" style={{ paddingBottom: 2 }}>
          <span className="py-1.5">{numLabel}</span>
          <span className="py-1.5">{denLabel}</span>
        </div>
        <div className="flex flex-col items-center">
          <input type="number" min={0} step={1} value={numValue} onChange={e => onChangeNum(e.target.value)}
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
          <div className="my-0.5 w-[4.5rem] border-t-2 border-[var(--color-text)]" />
          <input type="number" min={1} step={1} value={denValue} onChange={e => onChangeDen(e.target.value)}
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-white text-[var(--color-text)] [appearance:textfield]" />
        </div>
      </div>
      <div className="text-sm text-[var(--color-muted)]">= <span className="font-bold text-[var(--color-text)]">{phat}</span></div>
    </div>
  )
}

function ColStatLabel({ cx, n, s, p, highlight, layout }: {
  cx: number; n: number; s: number; p: number; highlight: boolean; layout: CardLayout
}) {
  const rows = Math.ceil(n / Math.max(1, layout.perRow))
  const top  = HEADER_H + rows * layout.stepY + 6
  return (
    <div style={{ position:'absolute', left:cx, top, transform:'translateX(-50%)', textAlign:'center', pointerEvents:'none' }}>
      <div className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-colors ${highlight ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)]'}`}>
        {s}/{n} = {p.toFixed(3)}
      </div>
    </div>
  )
}
