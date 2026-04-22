'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { TwoPropRandomizationCardConfig, TwoPropSimCardConfig } from '@/lib/exploreTypes'
import {
  Alternative,
  TwoProportionData,
  TwoProportionResult,
  buildTwoProportionData,
  isExtremeResult,
  runTwoProportionRandomization,
} from '@/lib/randomizationTest'

// ── Stage type ────────────────────────────────────────────────────────────────
// Pause: observed, pooled, shuffled, reassigned, computing, done
// Anim : pooling, shuffling, reassigning, plotting

type Stage =
  | 'observed'    | 'pooling'     | 'pooled'
  | 'shuffling'   | 'shuffled'
  | 'reassigning' | 'reassigned'
  | 'computing'   | 'plotting'    | 'done'

interface CardLayout { w:number; h:number; stepX:number; stepY:number; perRow:number }
interface CardPos    { x:number; y:number; rotation:number; delay:number; faceDown:boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W        = 640
const HEADER_H        = 24
const CARD_TOP_Y      = 8
const COL_W           = 240
const POOL_DUR        = 480   // ms: pooling animation
const SHUFFLE_DUR     = 180   // ms: each shuffle spread/return phase
const DEAL_DUR        = 260   // ms: each card's travel time when dealing
const NUM_SH_PHASES   = 6     // 3 spread + 3 return cycles

const COL_CX = {
  left: CANVAS_W * 0.28,
  center: CANVAS_W * 0.5,
  right: CANVAS_W * 0.72,
}

// Compute canvas height to fit actual card layout with no wasted space
function getCanvasHeight(n1: number, n2: number): number {
  const n = n1 + n2
  const layout = getCardLayout(n)
  const maxN = Math.max(n1, n2)
  const cols = Math.min(layout.perRow, maxN)
  const rows = Math.ceil(maxN / cols)
  return Math.max(118, Math.min(CARD_TOP_Y + rows * layout.stepY + 34, 210))
}

function getCardLayout(n: number): CardLayout {
  const w = n <= 20 ? 36 : n <= 40 ? 26 : n <= 80 ? 18 : n <= 160 ? 13 : n <= 300 ? 10 : 8
  const h = Math.ceil(w * 1.55)
  const gap = 2
  return { w, h, stepX: w + gap, stepY: h + gap, perRow: Math.max(1, Math.floor(COL_W / (w + gap))) }
}

function cardHash(id: number, salt = 0): number {
  return (((id + 1) * 2654435761 + salt * 40503) >>> 0) / 4294967296
}

function getSlotXY(idx: number, colCx: number, layout: CardLayout, groupSize: number) {
  const cols = Math.min(layout.perRow, groupSize)
  return {
    x: colCx - (cols * layout.stepX) / 2 + (idx % cols) * layout.stepX,
    y: CARD_TOP_Y + Math.floor(idx / cols) * layout.stepY,
  }
}

// Pile resting position for a card (original pool arrangement)
function pilePos(id: number, layout: CardLayout, pileCY: number) {
  return {
    x: COL_CX.center - layout.w/2 + (cardHash(id, 0) - 0.5) * 12,
    y: pileCY         - layout.h/2 + (cardHash(id, 1) - 0.5) * 8,
    rotation: (cardHash(id, 2) - 0.5) * 40,
  }
}

// Position for a given shuffle phase (1-indexed; odd=spread, even=return-to-pile)
function shufflePhasePos(id: number, phase: number, layout: CardLayout, pileCY: number) {
  const s = phase * 13  // unique salt per phase
  if (phase % 2 === 1) {
    // Spread: use independent x/y offsets so the cards scatter chaotically
    // instead of reading as a circular burst or spiral.
    const spreadX = (cardHash(id, s + 3) - 0.5) * 220 + (cardHash(id, s + 4) - 0.5) * 120
    const spreadY = (cardHash(id, s + 11) - 0.5) * 150 + (cardHash(id, s + 12) - 0.5) * 90
    return {
      x: COL_CX.center - layout.w/2 + spreadX,
      y: pileCY         - layout.h/2 + spreadY,
      rotation: (cardHash(id, s + 5) - 0.5) * 110,
    }
  } else {
    // Return: back to pile with a fresh arrangement
    return {
      x: COL_CX.center - layout.w/2 + (cardHash(id, s + 6) - 0.5) * 14,
      y: pileCY         - layout.h/2 + (cardHash(id, s + 7) - 0.5) * 10,
      rotation: (cardHash(id, s + 8) - 0.5) * 44,
    }
  }
}

// How long the last deal card takes to start (= total stagger window)
function dealStaggerMax(n: number): number {
  // Enough so first few cards are clearly one-at-a-time; scales for large n
  return Math.min(180, 1800 / n) * n  // capped ~1800 ms
}
function dealDelay(idx: number, n: number): number {
  return idx * Math.min(180, 1800 / n)
}

// ── Position map ──────────────────────────────────────────────────────────────

function computePositions(
  data: TwoProportionData,
  stage: Stage,
  assignment: number[],
  shufflePhase: number,
  pileCY: number,
): Map<number, CardPos> {
  const { cases, n1 } = data
  const n      = cases.length
  const layout = getCardLayout(n)
  const pos    = new Map<number, CardPos>()

  // Observed split
  if (stage === 'observed') {
    const g1 = cases.filter(c => c.group === 0).sort((a,b) => b.response - a.response)
    const g2 = cases.filter(c => c.group === 1).sort((a,b) => b.response - a.response)
    g1.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, g1.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    g2.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, g2.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    return pos
  }

  // Original pool pile
  if (stage === 'pooling' || stage === 'pooled') {
    cases.forEach(c => {
      const {x,y,rotation} = pilePos(c.id, layout, pileCY)
      pos.set(c.id, {x,y,rotation,delay:0,faceDown:true})
    })
    return pos
  }

  // Shuffle phases — each phase uses its own position calculation
  if (stage === 'shuffling') {
    const ph = shufflePhase < 1 ? 1 : shufflePhase
    cases.forEach((c) => {
      const {x,y,rotation} = shufflePhasePos(c.id, ph, layout, pileCY)
      // Spread phases (odd): stagger outward. Return phases (even): all together.
      const delay = ph % 2 === 1 ? cardHash(c.id, ph * 7 + 99) * 55 : 0
      pos.set(c.id, {x,y,rotation,delay,faceDown:true})
    })
    return pos
  }

  // Shuffled (final return phase positions — no movement from last shuffle phase)
  if (stage === 'shuffled') {
    cases.forEach(c => {
      const {x,y,rotation} = shufflePhasePos(c.id, NUM_SH_PHASES, layout, pileCY)
      pos.set(c.id, {x,y,rotation,delay:0,faceDown:true})
    })
    return pos
  }

  // Dealing face-down: stagger for clear one-at-a-time visual
  if (stage === 'reassigning') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    // Deal left group first then right group, card-by-card
    g1Sim.forEach((c,i) => {
      const {x,y} = getSlotXY(i, COL_CX.left, layout, n1)
      pos.set(c.id, {x,y,rotation:0,delay:dealDelay(i, n),faceDown:true})
    })
    g2Sim.forEach((c,i) => {
      const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1)
      pos.set(c.id, {x,y,rotation:0,delay:dealDelay(n1 + i, n),faceDown:true})
    })
    return pos
  }

  // Reassigned (face-down, settled)
  if (stage === 'reassigned') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    g1Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    g2Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    return pos
  }

  // computing / plotting / done: face-up
  const aSet  = new Set(assignment)
  const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
  const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
  g1Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  g2Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  return pos
}

// ── Null distribution plot ────────────────────────────────────────────────────

function NullDistPlot({ values, diffObs, alternative, showNormalCurve = false }: {
  values: number[]; diffObs: number; alternative: Alternative; showNormalCurve?: boolean
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 30, l: 16 }
  const plotHeight = 320
  const SVG_H = plotHeight + MG.t + MG.b
  const PW = SVG_W - MG.l - MG.r, PH = SVG_H - MG.t - MG.b

  const normalizedValues = values.map(v => Number(v.toFixed(6)))
  const uniqueValues = Array.from(new Set(normalizedValues)).sort((a, b) => a - b)
  const inferredStep = uniqueValues.length < 2
    ? 0.05
    : uniqueValues.slice(1).reduce((minGap, value, index) => {
        const gap = value - uniqueValues[index]
        return gap > 0 ? Math.min(minGap, gap) : minGap
      }, Number.POSITIVE_INFINITY)
  const bucket = Number.isFinite(inferredStep) && inferredStep > 0 ? inferredStep : 0.05

  const rangeSource = values.length > 0 ? [...values, diffObs, 0] : [diffObs, 0]
  const maxAbsValue = Math.max(...rangeSource.map(value => Math.abs(value)))
  const axisHalfRange = Math.max(0.05, maxAbsValue * 1.25 + bucket * 2)
  const xMin = -axisHalfRange
  const xMax = axisHalfRange
  const xSpan = Math.max(1e-9, xMax - xMin)
  const xOf = (v: number) => ((v - xMin) / xSpan) * PW

  const tickValues = Array.from({ length: 5 }, (_, i) => xMin + (xSpan * i) / 4)
  const tickLabel = (value: number) => {
    const rounded = Math.abs(value) < 0.0005 ? 0 : value
    return rounded.toFixed(axisHalfRange < 0.1 ? 2 : 1)
  }

  const stackCounts = new Map<number, number>()
  normalizedValues.forEach(v => {
    stackCounts.set(v, (stackCounts.get(v) ?? 0) + 1)
  })
  const maxStack = Math.max(1, ...Array.from(stackCounts.values()))

  const normalStats = (() => {
    if (!showNormalCurve || values.length < 2) return null
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    const sd = Math.sqrt(variance)
    if (!Number.isFinite(sd) || sd <= 0) return null
    const samples = Array.from({ length: 241 }, (_, i) => {
      const x = xMin + (xSpan * i) / 240
      const z = (x - mean) / sd
      const pdf = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI))
      return { x, expectedCount: values.length * pdf * bucket }
    })
    return { mean, sd, samples }
  })()

  const maxCurveCount = normalStats ? Math.max(...normalStats.samples.map(sample => sample.expectedCount)) : 0
  const topPad = 10
  const yMaxCount = Math.max(maxStack, maxCurveCount) * 1.12
  const yScale = (PH - topPad) / Math.max(1, yMaxCount)

  const seenC2 = new Map<number,number>()
  const dotStep = Math.min(6, yScale)
  const dotR    = Math.max(0.55, Math.min(2.6, dotStep / 2 - 0.15))
  const circles = values.map(v => {
      const b  = v
      const si = seenC2.get(b) ?? 0
      seenC2.set(b, si+1)
      return { cx:xOf(b), cy:PH - (si + 1) * dotStep + dotStep / 2, extreme:isExtremeResult(v, diffObs, alternative) }
  })

  const normalPath = (() => {
    if (!normalStats) return ''
    return normalStats.samples
      .map(sample => `${xOf(sample.x)},${Math.min(PH, Math.max(0, PH - sample.expectedCount * yScale))}`)
      .join(' ')
  })()

  const obsX = xOf(diffObs)
  let shade = ''
  if (alternative==='greater') shade=`M${obsX},0 H${PW} V${PH} H${obsX} Z`
  else if (alternative==='less') shade=`M0,0 H${obsX} V${PH} H0 Z`
  else { const xL=xOf(-Math.abs(diffObs)),xR=xOf(Math.abs(diffObs)); shade=`M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z` }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop-full{from{transform:translateY(-${PH}px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH}/></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shade} fill="#0EA5A0" opacity={0.10}/>
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5}/>
        {tickValues.map(v => (
          <g key={v} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="#CBD5E1" strokeWidth={1}/>
            <text y={12} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="DM Sans,sans-serif">{tickLabel(v)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circles.map((c,i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR} fill={c.extreme?'#0EA5A0':'#94A3B8'} opacity={0.85}
              style={i===circles.length-1&&values.length>0?{animation:'dot-drop-full 500ms ease-out'}:undefined}/>
          ))}
          {normalPath && (
            <polyline
              points={normalPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </g>
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="#EF4444" strokeWidth={1.8} strokeDasharray="4,3"/>
        <text x={obsX+(diffObs>=0?3:-3)} y={5} textAnchor={diffObs>=0?'start':'end'} fontSize={8} fill="#EF4444" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        <text x={PW/2} y={PH+24} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans,sans-serif">Simulated p̂₁ − p̂₂</text>
      </g>
    </svg>
  )
}

function getNullDistributionSummary(data: TwoProportionData) {
  const N = data.n1 + data.n2
  if (N <= 1) return { mean: 0, sd: 0 }
  const pPool = (data.s1 + data.s2) / N
  const variance = pPool * (1 - pPool) * (1 / data.n1 + 1 / data.n2) * ((N - data.n1) / (N - 1))
  return {
    mean: 0,
    sd: Math.sqrt(Math.max(0, variance)),
  }
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: { label:string; stages:Stage[] }[] = [
  { label:'1. Pool',     stages:['observed','done'] },
  { label:'2. Shuffle',  stages:['pooled'] },
  { label:'3. Reassign', stages:['shuffled'] },
  { label:'4. Compute',  stages:['reassigned'] },
  { label:'5. Record',   stages:['computing'] },
]

const CAPTIONS: Record<Stage,string> = {
  observed:   'Observed data',
  pooling:    'Pooling cases…',
  pooled:     'Pooled — ready to shuffle',
  shuffling:  'Shuffling…',
  shuffled:   'Shuffled — ready to reassign',
  reassigning:'Dealing cards one by one…',
  reassigned: 'Assigned face-down — ready to compute',
  computing:  'Simulated proportions revealed',
  plotting:   'Recording on null distribution…',
  done:       'Done',
}

function colStats(cases: TwoProportionData['cases'], group:0|1, assignment:number[]|null, stage:Stage) {
  const useObs = stage==='observed'||stage==='pooling'
  let members: typeof cases
  if (useObs) members = cases.filter(c => c.group===group)
  else if (assignment) {
    const s = new Set(assignment)
    members = group===0 ? cases.filter(c => s.has(c.id)) : cases.filter(c => !s.has(c.id))
  } else return {n:0,s:0,p:0}
  const n = members.length, s = members.filter(c => c.response===1).length
  return {n,s,p:n>0?s/n:0}
}

// ── Main component ────────────────────────────────────────────────────────────

type SourceMode = 'data' | 'manual'
interface Props { cardId:string; config:TwoPropRandomizationCardConfig; onClearZone:(z:string)=>void }

export function TwoPropRandomizationTest({ cardId, config, onClearZone }: Props) {
  const { grid, updateExploreCard, addTwoPropSimCard, exploreCards } = useStore()

  // Config
  const [sourceMode, setSourceMode]     = useState<SourceMode>('manual')
  const [alternative, setAlternative]   = useState<Alternative>('less')
  const [nullDiff, setNullDiff]         = useState('0')
  const [successLevel, setSuccessLevel] = useState('')
  const [groupA, setGroupA]             = useState('')
  const [groupB, setGroupB]             = useState('')
  const [manualS1, setManualS1]         = useState('')
  const [manualN1, setManualN1]         = useState('')
  const [manualS2, setManualS2]         = useState('')
  const [manualN2, setManualN2]         = useState('')
  const [manualLabel1, setManualLabel1] = useState('Group 1')
  const [manualLabel2, setManualLabel2] = useState('Group 2')

  const responseCol = config.var1ColId ? (grid.columns.find(c => c.id===config.var1ColId)??null) : null
  const groupCol    = config.var2ColId ? (grid.columns.find(c => c.id===config.var2ColId)??null) : null

  function handleNativeDrop(zone: 'var1'|'var2') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return; e.preventDefault()
      const droppedCol = useStore.getState().grid.columns.find(c => c.id===colId)
      if (!droppedCol||droppedCol.type!=='categorical') return
      const current = useStore.getState().exploreCards.find(c => c.id===cardId)
      if (!current||current.config.type!=='two-prop-randomization') return
      updateExploreCard(cardId, { config:{...current.config,...(zone==='var1'?{var1ColId:colId}:{var2ColId:colId})} })
    }
  }
  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect='copy' }
  }

  const responseLevels = useMemo(() =>
    config.var1ColId ? [...new Set(grid.rows.map(r=>String(r[config.var1ColId!]??'').trim()).filter(Boolean))].sort() : [],
    [grid.rows, config.var1ColId])
  const groupLevels = useMemo(() =>
    config.var2ColId ? [...new Set(grid.rows.map(r=>String(r[config.var2ColId!]??'').trim()).filter(Boolean))].sort() : [],
    [grid.rows, config.var2ColId])

  useEffect(() => {
    if (responseLevels.length>0) setSuccessLevel(c=>(c&&responseLevels.includes(c))?c:responseLevels[0])
  }, [responseLevels])
  useEffect(() => {
    if (groupLevels.length>=2) {
      setGroupA(c=>(c&&groupLevels.includes(c))?c:groupLevels[0])
      setGroupB(c=>(c&&groupLevels.includes(c)&&c!==groupLevels[0])?c:groupLevels[1])
    }
  }, [groupLevels])

  const data = useMemo<TwoProportionData|null>(() => {
    if (sourceMode==='manual') {
      const n1=parseInt(manualN1,10),s1=parseInt(manualS1,10),n2=parseInt(manualN2,10),s2=parseInt(manualS2,10)
      if (![n1,s1,n2,s2].every(Number.isFinite)||n1<=0||n2<=0||s1<0||s2<0||s1>n1||s2>n2) return null
      return buildTwoProportionData(n1,s1,n2,s2, manualLabel1.trim()||'Group 1', manualLabel2.trim()||'Group 2','Success','Failure')
    }
    if (!config.var1ColId||!config.var2ColId||!successLevel||!groupA||!groupB) return null
    let n1=0,s1=0,n2=0,s2=0
    for (const row of grid.rows) {
      const resp=String(row[config.var1ColId]??'').trim(), grp=String(row[config.var2ColId]??'').trim()
      if (!resp||!grp) continue
      if (grp===groupA){n1++;if(resp===successLevel)s1++}
      else if(grp===groupB){n2++;if(resp===successLevel)s2++}
    }
    if (n1===0||n2===0) return null
    return buildTwoProportionData(n1,s1,n2,s2,groupA,groupB,successLevel,'Not Success')
  }, [config.var1ColId,config.var2ColId,grid.rows,groupA,groupB,manualN1,manualN2,manualS1,manualS2,manualLabel1,manualLabel2,sourceMode,successLevel])

  function handleLaunch() {
    if (!data) return
    const myCard = exploreCards.find(c => c.id === cardId)
    if (!myCard) return
    // Check if a sim card linked to this config card already exists
    const existing = exploreCards.find(c => c.config.type === 'two-prop-sim' &&
      c.config.label1 === data.group1Label && c.config.n1 === data.n1)
    if (existing) return  // already open
    addTwoPropSimCard({
      n1: data.n1, s1: data.s1, n2: data.n2, s2: data.s2,
      label1: data.group1Label, label2: data.group2Label,
      successLabel: data.successLabel, failureLabel: data.failureLabel,
      alternative, nullDiff,
    }, myCard)
  }

  return (
    <div className="space-y-4">
      {/* Config card */}
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Source</span>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {(['data','manual'] as SourceMode[]).map((m,i)=>(
              <button key={m} onClick={()=>setSourceMode(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${i>0?'border-l border-[var(--color-border)]':''} ${sourceMode===m?'bg-[var(--color-text)] text-[var(--color-surface)]':'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}>
                {m==='data'?'Use Data':'Enter Info'}
              </button>
            ))}
          </div>
        </div>

        {sourceMode==='data' ? (
          <>
            <div className="flex gap-2">
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
                <DropZone id={`${cardId}:var1`} label="Response Variable" hint="categorical only" assignedCol={responseCol} onClear={()=>onClearZone('var1')}/>
              </div>
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
                <DropZone id={`${cardId}:var2`} label="Group By" hint="categorical only" assignedCol={groupCol} onClear={()=>onClearZone('var2')}/>
              </div>
            </div>
            {responseLevels.length>1&&(
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
                <select value={successLevel} onChange={e=>setSuccessLevel(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]">
                  {responseLevels.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {groupLevels.length>2&&(
              <div className="flex gap-2">
                {(['Compare','vs.'] as const).map((lbl,idx)=>{
                  const [val,setter,other]=idx===0?[groupA,setGroupA,groupB]:[groupB,setGroupB,groupA]
                  return (
                    <div key={lbl} className="flex-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                      <select value={val} onChange={e=>setter(e.target.value)} className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]">
                        {groupLevels.filter(g=>g!==other).map(g=><option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
            {data && (
              <div className="rounded-xl bg-[var(--color-accent-light)] border border-[var(--color-border)] px-4 py-2 text-sm space-y-1.5">
                <div className="text-[var(--color-muted)]">
                  Success means <span className="font-semibold text-[var(--color-text)]">{responseCol?.name ?? 'response'}</span> = <span className="font-semibold text-[var(--color-text)]">{successLevel}</span>
                </div>
                <div className="text-[var(--color-muted)]">
                  <span className="font-semibold text-[var(--color-text)]">{data.group1Label}</span>: p̂₁ = {data.s1}/{data.n1} = <span className="font-semibold text-[var(--color-text)]">{data.p1.toFixed(3)}</span>
                  <span className="mx-3">|</span>
                  <span className="font-semibold text-[var(--color-text)]">{data.group2Label}</span>: p̂₂ = {data.s2}/{data.n2} = <span className="font-semibold text-[var(--color-text)]">{data.p2.toFixed(3)}</span>
                </div>
                <div className="text-[var(--color-muted)]">
                  p̂₁ − p̂₂ = {data.p1.toFixed(3)} − {data.p2.toFixed(3)} = <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Group 1 name</label>
                <input value={manualLabel1} onChange={e=>setManualLabel1(e.target.value)} placeholder="Group 1"
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]"/>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Group 2 name</label>
                <input value={manualLabel2} onChange={e=>setManualLabel2(e.target.value)} placeholder="Group 2"
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]"/>
              </div>
            </div>
            <div className="flex items-center justify-around py-1">
              <FractionInput label="p̂₁" numLabel="x₁" denLabel="n₁" numValue={manualS1} denValue={manualN1} onChangeNum={setManualS1} onChangeDen={setManualN1}/>
              <div className="w-px h-20 bg-[var(--color-border)]"/>
              <FractionInput label="p̂₂" numLabel="x₂" denLabel="n₂" numValue={manualS2} denValue={manualN2} onChangeNum={setManualS2} onChangeDen={setManualN2}/>
            </div>
            {data&&(
              <div className="rounded-xl bg-[var(--color-accent-light)] border border-[var(--color-border)] px-4 py-2 text-center text-sm">
                <span className="text-[var(--color-muted)]">p̂₁ − p̂₂ = {data.p1.toFixed(3)} − {data.p2.toFixed(3)} = </span>
                <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₀: p₁−p₂=</span>
            <input type="number" min={-1} max={1} step={0.01} value={nullDiff} onChange={e=>setNullDiff(e.target.value)}
              className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">H₁</span>
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">p₁ − p₂</span>
            <select value={alternative} onChange={e=>setAlternative(e.target.value as Alternative)}
              className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]">
              <option value="less">&lt;</option><option value="greater">&gt;</option><option value="two">≠</option>
            </select>
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">{nullDiff}</span>
          </div>
          <button onClick={handleLaunch} disabled={!data}
            className="ml-auto rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            Launch Simulation →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FractionInput({ label, numLabel, denLabel, numValue, denValue, onChangeNum, onChangeDen }: {
  label:string; numLabel:string; denLabel:string
  numValue:string; denValue:string
  onChangeNum:(v:string)=>void; onChangeDen:(v:string)=>void
}) {
  const num=parseInt(numValue,10), den=parseInt(denValue,10)
  const phat=(Number.isFinite(num)&&Number.isFinite(den)&&den>0&&num>=0&&num<=den)?(num/den).toFixed(3):'—'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-center">
        <span className="text-base font-bold text-[var(--color-text)]">{label}</span>
        <span className="text-xs text-[var(--color-muted)] ml-1">= {numLabel}/{denLabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col items-end gap-1 text-xs font-mono text-[var(--color-muted)]" style={{paddingBottom:2}}>
          <span className="py-1.5">{numLabel}</span>
          <span className="py-1.5">{denLabel}</span>
        </div>
        <div className="flex flex-col items-center">
          <input type="number" min={0} step={1} value={numValue} onChange={e=>onChangeNum(e.target.value)}
            placeholder=" "
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] [appearance:textfield]"/>
          <div className="my-0.5 w-[4.5rem] border-t-2 border-[var(--color-text)]"/>
          <input type="number" min={1} step={1} value={denValue} onChange={e=>onChangeDen(e.target.value)}
            placeholder=" "
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] [appearance:textfield]"/>
        </div>
      </div>
      <div className="text-sm text-[var(--color-muted)]">= <span className="font-bold text-[var(--color-text)]">{phat}</span></div>
    </div>
  )
}

function ColStatLabel({ cx, n, s, p, highlight, layout }: {
  cx:number; n:number; s:number; p:number; highlight:boolean; layout:CardLayout
}) {
  return (
    <div style={{position:'absolute',left:cx,top:5,transform:'translateX(-50%)',textAlign:'center',pointerEvents:'none'}}>
      <div className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-colors ${highlight?'bg-[var(--color-accent)] text-white':'bg-[var(--color-accent-light)] text-[var(--color-muted)]'}`}>
        {s}/{n} = {p.toFixed(3)}
      </div>
    </div>
  )
}

// ── TwoPropSimCard ─────────────────────────────────────────────────────────────
// Standalone canvas card for the simulation panel

export function TwoPropSimCard({ cardId, config }: { cardId: string; config: TwoPropSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const data = useMemo(() =>
    buildTwoProportionData(config.n1, config.s1, config.n2, config.s2,
      config.label1, config.label2, config.successLabel, config.failureLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.n1, config.s1, config.n2, config.s2, config.label1, config.label2, config.successLabel, config.failureLabel])

  // Local animation state
  const [stage, setStage]               = useState<Stage>('observed')
  const [shufflePhase, setShufflePhase] = useState(0)
  const [assignment, setAssignment]     = useState<number[]>([])
  const [currentResult, setCurrentResult] = useState<TwoProportionResult|null>(null)
  const [highlightSim, setHighlightSim] = useState(false)
  const [isRunning, setIsRunning]       = useState(false)

  // Persisted results come from card config
  const nullDist    = config.nullDist
  const simCount    = config.simCount
  const extremeCount = config.extremeCount
  const alternative = config.alternative
  const nullDiff    = config.nullDiff

  const cases      = data.cases
  const layout     = getCardLayout(cases.length)
  const canvasH    = getCanvasHeight(data.n1, data.n2)
  const pileCY     = HEADER_H + (canvasH - HEADER_H) / 2
  const isAnimating = ['pooling','shuffling','reassigning','plotting'].includes(stage)
  const pValue     = simCount > 0 ? extremeCount / simCount : null
  const positions  = computePositions(data, stage, assignment, shufflePhase, pileCY)
  const cardTransDur    = stage==='shuffling' ? SHUFFLE_DUR : stage==='reassigning' ? DEAL_DUR : POOL_DUR
  const showNormalCurve = config.showNormalCurve ?? false
  const nullSummary = useMemo(() => getNullDistributionSummary(data), [data])

  const dataRef   = useRef(data)
  const altRef    = useRef(alternative)
  const resultRef = useRef<TwoProportionResult|null>(null)
  const cancelRef = useRef(false)
  useEffect(()=>{ dataRef.current=data },[data])
  useEffect(()=>{ altRef.current=alternative },[alternative])

  // ── Stage machine ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!['pooling','reassigning'].includes(stage)) return
    let id: ReturnType<typeof setTimeout>
    if (stage==='pooling') {
      id = setTimeout(()=>setStage('pooled'), POOL_DUR + 80)
    } else if (stage==='reassigning') {
      const total = dealStaggerMax(dataRef.current.cases.length) + DEAL_DUR + 120
      id = setTimeout(()=>setStage('reassigned'), total)
    }
    return ()=>clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  // ── Shuffle phase machine ─────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'shuffling') { if (shufflePhase !== 0) setShufflePhase(0); return }
    if (shufflePhase === 0) return
    const id = setTimeout(() => {
      if (shufflePhase >= NUM_SH_PHASES) { setStage('shuffled'); setShufflePhase(0) }
      else setShufflePhase(p => p + 1)
    }, SHUFFLE_DUR + 15)
    return () => clearTimeout(id)
  }, [stage, shufflePhase])

  function handleStep() {
    if (isAnimating || isRunning) return
    if (stage==='observed'||stage==='done')  { setStage('pooling') }
    else if (stage==='pooled')   { setStage('shuffling'); setShufflePhase(1) }
    else if (stage==='shuffled') {
      const result = runTwoProportionRandomization(data)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result); setStage('reassigning')
    }
    else if (stage==='reassigned') { setHighlightSim(true); setStage('computing') }
    else if (stage==='computing')  {
      setHighlightSim(false)
      setStage('plotting')
      const result = resultRef.current
      if (!result) return
      window.setTimeout(() => {
        const newDist = [...nullDist, result.diffSim]
        const newCount = simCount + 1
        const newExtreme = extremeCount + (isExtremeResult(result.diffSim, data.diffObs, alternative) ? 1 : 0)
        updateExploreCard(cardId, { config: { ...config, nullDist: newDist, simCount: newCount, extremeCount: newExtreme } })
        setStage('done')
      }, 320)
    }
  }

  async function runAnimated(count: number) {
    if (isRunning || isAnimating) return
    cancelRef.current = false
    setIsRunning(true)

    let localNullDist = [...config.nullDist]
    let localSimCount = config.simCount
    let localExtremeCount = config.extremeCount

    const computePause = count === 1 ? 220 : 120
    const gapPause = count === 1 ? 80 : 40

    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break
      setHighlightSim(false)
      setStage('pooling')
      await sleep(POOL_DUR + 100)
      if (cancelRef.current) break

      setStage('shuffling')
      setShufflePhase(1)
      await sleep(NUM_SH_PHASES * (SHUFFLE_DUR + 15) + 40)
      if (cancelRef.current) break

      const result = runTwoProportionRandomization(dataRef.current)
      resultRef.current = result
      setAssignment(result.assignment)
      setCurrentResult(result)
      setStage('reassigning')
      await sleep(dealStaggerMax(dataRef.current.cases.length) + DEAL_DUR + 140)
      if (cancelRef.current) break

      setHighlightSim(true)
      setStage('computing')
      await sleep(computePause)
      if (cancelRef.current) break

      setHighlightSim(false)
      setStage('plotting')
      await sleep(320)
      if (cancelRef.current) break

      localNullDist = [...localNullDist, result.diffSim]
      localSimCount += 1
      localExtremeCount += isExtremeResult(result.diffSim, dataRef.current.diffObs, altRef.current) ? 1 : 0
      updateExploreCard(cardId, { config: {
        ...config,
        nullDist: localNullDist,
        simCount: localSimCount,
        extremeCount: localExtremeCount,
      }})
      setStage('done')

      if (i < count - 1) await sleep(gapPause)
    }

    setIsRunning(false)
    cancelRef.current = false
  }

  function runBatch(count: number) {
    if (isRunning || isAnimating) return
    const diffs: number[] = []
    let newExtreme = 0
    let last: TwoProportionResult | null = null
    for (let i=0; i<count; i++) {
      const r = runTwoProportionRandomization(data)
      last = r
      diffs.push(r.diffSim)
      if (isExtremeResult(r.diffSim, data.diffObs, alternative)) newExtreme++
    }
    if (last) {
      setAssignment(last.assignment)
      setCurrentResult(last)
    }
    setStage('done')
    updateExploreCard(cardId, { config: {
      ...config,
      nullDist: [...nullDist, ...diffs],
      simCount: simCount + count,
      extremeCount: extremeCount + newExtreme,
    }})
  }

  function handleReset() {
    cancelRef.current = true
    setIsRunning(false)
    setStage('observed'); setShufflePhase(0); setAssignment([]); setCurrentResult(null); setHighlightSim(false)
    updateExploreCard(cardId, { config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 } })
  }

  const POOL_STAGES: Stage[] = ['pooling','pooled','shuffling','shuffled','reassigning']
  const showSplit    = !POOL_STAGES.includes(stage)
  const showCenter   = POOL_STAGES.includes(stage)
  const showFaceUp   = ['computing','plotting','done'].includes(stage)
  const showColStats = showSplit && showFaceUp
  const leftStats    = colStats(cases, 0, showFaceUp ? assignment : null, stage)
  const rightStats   = colStats(cases, 1, showFaceUp ? assignment : null, stage)
  const altSymbol    = alternative==='less'?'<':alternative==='greater'?'>':'≠'
  const altStatement = `p₁ − p₂ ${altSymbol} ${nullDiff}`
  const currentSimLine = currentResult
    ? `${config.label1}: ${currentResult.s1Sim}/${data.n1} = ${currentResult.p1Sim.toFixed(3)}, ${config.label2}: ${currentResult.s2Sim}/${data.n2} = ${currentResult.p2Sim.toFixed(3)}, p̂₁ − p̂₂ = ${currentResult.diffSim.toFixed(3)}${isExtremeResult(currentResult.diffSim,data.diffObs,alternative)?' ★':''}`
    : 'Run a simulation to show the current randomized proportions.'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-[var(--color-muted)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span><span className="font-semibold text-[var(--color-text)]">H₀:</span> p₁ − p₂ = {nullDiff}</span>
            <span><span className="font-semibold text-[var(--color-text)]">Hₐ:</span> {altStatement}</span>
            <span><span className="font-semibold text-[var(--color-text)]">n₁:</span> {data.n1}</span>
            <span><span className="font-semibold text-[var(--color-text)]">n₂:</span> {data.n2}</span>
            <span><span className="font-semibold text-[var(--color-text)]">N:</span> {cases.length}</span>
            <span><span className="font-semibold text-[var(--color-text)]">p̂₁ − p̂₂:</span> <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span></span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="overflow-x-auto flex justify-center">
              <div className="w-fit">
                <div className="relative bg-slate-50 border-b border-[var(--color-border)] flex-shrink-0" style={{width:CANVAS_W,height:HEADER_H}}>
                  <span style={{position:'absolute',left:COL_CX.left,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label1}</span>
                  {showCenter&&<span style={{position:'absolute',left:COL_CX.center,top:'50%',transform:'translate(-50%,-50%)',fontSize:11,color:'var(--color-muted)'}}>Pooled</span>}
                  <span style={{position:'absolute',left:COL_CX.right,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label2}</span>
                  {showColStats&&(
                    <>
                      <ColStatLabel cx={COL_CX.left} n={leftStats.n} s={leftStats.s} p={leftStats.p} highlight={highlightSim} layout={layout}/>
                      <ColStatLabel cx={COL_CX.right} n={rightStats.n} s={rightStats.s} p={rightStats.p} highlight={highlightSim} layout={layout}/>
                    </>
                  )}
                </div>

                <div className="relative bg-white flex-shrink-0 overflow-hidden" style={{width:CANVAS_W,height:canvasH,transition:'height 400ms ease'}}>
                  <div className="absolute inset-y-0 transition-all duration-500" style={{
                    left:COL_CX.left-COL_W/2-4,width:COL_W+8,
                    background:showSplit?'rgba(14,165,160,0.04)':'transparent',
                    borderRight:showSplit?'1px dashed rgba(14,165,160,0.2)':'none',
                  }}/>
                  <div className="absolute inset-y-0 transition-all duration-500" style={{
                    left:COL_CX.right-COL_W/2-4,width:COL_W+8,
                    background:showSplit?'rgba(14,165,160,0.04)':'transparent',
                    borderLeft:showSplit?'1px dashed rgba(14,165,160,0.2)':'none',
                  }}/>
                  {cases.map(c => {
                    const p  = positions.get(c.id) ?? {x:-50,y:-50,rotation:0,delay:0,faceDown:false}
                    const fd = p.faceDown
                    const isSuccess = c.response===1
                    const bg  = fd?'#1A8C80':isSuccess?'#2EC4B6':'#E2E8F0'
                    const bdr = fd?'#0D6B63':isSuccess?'#1A8C80':'#CBD5E1'
                    return (
                      <div key={c.id} style={{
                        position:'absolute',left:p.x,top:p.y,width:layout.w,height:layout.h,
                        transition:`left ${cardTransDur}ms ease-in-out,top ${cardTransDur}ms ease-in-out,transform ${cardTransDur}ms ease-in-out,background-color 160ms,border-color 160ms`,
                        transitionDelay:`${p.delay}ms`,transform:`rotate(${p.rotation}deg)`,
                        borderRadius:Math.max(2,Math.floor(layout.w/7)),
                        backgroundColor:bg,border:`${Math.max(1,Math.floor(layout.w/14))}px solid ${bdr}`,
                        boxShadow:fd?'0 2px 5px rgba(0,0,0,0.20)':'0 1px 2px rgba(0,0,0,0.10)',boxSizing:'border-box',
                      }}/>
                    )
                  })}
                </div>

                <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-slate-50 px-3 py-1.5" style={{width:CANVAS_W}}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      <span className="inline-block rounded-sm bg-[#2EC4B6] flex-shrink-0" style={{width:8,height:13,boxShadow:'0 1px 2px rgba(0,0,0,0.15)'}}/>
                      {config.successLabel}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      <span className="inline-block rounded-sm bg-[#E2E8F0] border border-[#CBD5E1] flex-shrink-0" style={{width:8,height:13}}/>
                      {config.failureLabel}
                    </div>
                    <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">{CAPTIONS[stage]}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-xs text-[var(--color-muted)]">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span><span className="font-semibold text-[var(--color-text)]">Obs:</span> {config.label1}: {data.s1}/{data.n1} = {data.p1.toFixed(3)}, {config.label2}: {data.s2}/{data.n2} = {data.p2.toFixed(3)}</span>
              <span><span className="font-semibold text-[var(--color-text)]">Sim:</span> {currentSimLine}</span>
              <span className="ml-auto"><span className="font-semibold text-[var(--color-text)]">Total:</span> {simCount}</span>
            </div>
          </div>
        </div>

        {/* Null distribution */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex flex-col gap-1.5">
          <div className="flex gap-4 items-stretch">
            <div className="w-40 flex-shrink-0 flex flex-col gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              <div className="flex flex-col items-start gap-2 text-xs text-[var(--color-muted)]">
                <label className="flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={showNormalCurve}
                    onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                    className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span>Overlay normal curve</span>
                </label>
                <div className="pl-6 leading-tight">
                  <div>Mean = {nullSummary.mean.toFixed(3)}</div>
                  <div>SD = {nullSummary.sd.toFixed(3)}</div>
                </div>
                <div className="pt-2 leading-tight">
                  <div>
                    Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span> / {simCount}
                  </div>
                  <div className="pt-1 font-semibold text-[var(--color-accent)]">
                    {pValue!==null?`p ≈ ${pValue<0.001?'< 0.001':pValue.toFixed(4)}`:'p = —'}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="min-h-0" style={{height: 320}}>
            {simCount===0
              ?<div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">Run simulations to build the null distribution</div>
              :<NullDistPlot values={nullDist} diffObs={data.diffObs} alternative={alternative} showNormalCurve={showNormalCurve}/>
            }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-slate-50">
        <div className="flex items-center gap-1">
          {STEPS.map(({label,stages})=>{
            const active = (stages as Stage[]).includes(stage)&&!isAnimating
            return (
              <button key={label} onClick={handleStep} disabled={!active}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${
                  active?'bg-[var(--color-accent)] border-[var(--color-accent)] text-white shadow-sm scale-105'
                        :'border-[var(--color-border)] text-[var(--color-muted)] opacity-30 cursor-default'
                }`}>
                {label}
              </button>
            )
          })}
        </div>
        {isAnimating&&<span className="text-xs italic text-[var(--color-muted)]">Animating…</span>}
        <div className="w-px h-5 bg-[var(--color-border)] mx-1"/>
        {[1,10].map(n=>(
          <button key={n} onClick={()=>runAnimated(n)} disabled={isAnimating || isRunning}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Run {n.toLocaleString()}
          </button>
        ))}
        {[100,1000].map(n=>(
          <button key={n} onClick={()=>runBatch(n)} disabled={isAnimating || isRunning}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Run {n.toLocaleString()}
          </button>
        ))}
        <button onClick={handleReset} disabled={isAnimating || isRunning}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Reset
        </button>
      </div>
    </div>
  )
}
