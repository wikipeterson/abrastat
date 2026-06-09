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

// ── Animation stage ───────────────────────────────────────────────────────────

type AnimStage =
  | 'observed'    | 'pooling'     | 'pooled'
  | 'shuffling'   | 'shuffled'
  | 'reassigning' | 'reassigned'
  | 'computing'   | 'plotting'    | 'done'

type CardStage = 'setup' | 'simulate' | 'conclude'

interface CardLayout { w:number; h:number; stepX:number; stepY:number; perRow:number }
interface CardPos    { x:number; y:number; rotation:number; delay:number; faceDown:boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W        = 640
const HEADER_H        = 24
const CARD_TOP_Y      = 8
const COL_W           = 240
const POOL_DUR        = 480
const SHUFFLE_DUR     = 180
const DEAL_DUR        = 260
const NUM_SH_PHASES   = 6

const COL_CX = {
  left: CANVAS_W * 0.28,
  center: CANVAS_W * 0.5,
  right: CANVAS_W * 0.72,
}

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

function pilePos(id: number, layout: CardLayout, pileCY: number) {
  return {
    x: COL_CX.center - layout.w/2 + (cardHash(id, 0) - 0.5) * 12,
    y: pileCY         - layout.h/2 + (cardHash(id, 1) - 0.5) * 8,
    rotation: (cardHash(id, 2) - 0.5) * 40,
  }
}

function shufflePhasePos(id: number, phase: number, layout: CardLayout, pileCY: number) {
  const s = phase * 13
  if (phase % 2 === 1) {
    const spreadX = (cardHash(id, s + 3) - 0.5) * 220 + (cardHash(id, s + 4) - 0.5) * 120
    const spreadY = (cardHash(id, s + 11) - 0.5) * 150 + (cardHash(id, s + 12) - 0.5) * 90
    return {
      x: COL_CX.center - layout.w/2 + spreadX,
      y: pileCY         - layout.h/2 + spreadY,
      rotation: (cardHash(id, s + 5) - 0.5) * 110,
    }
  } else {
    return {
      x: COL_CX.center - layout.w/2 + (cardHash(id, s + 6) - 0.5) * 14,
      y: pileCY         - layout.h/2 + (cardHash(id, s + 7) - 0.5) * 10,
      rotation: (cardHash(id, s + 8) - 0.5) * 44,
    }
  }
}

function dealStaggerMax(n: number): number {
  return Math.min(180, 1800 / n) * n
}

function dealDelay(idx: number, n: number): number {
  return idx * Math.min(180, 1800 / n)
}

function computePositions(
  data: TwoProportionData,
  stage: AnimStage,
  assignment: number[],
  shufflePhase: number,
  pileCY: number,
): Map<number, CardPos> {
  const { cases, n1 } = data
  const n      = cases.length
  const layout = getCardLayout(n)
  const pos    = new Map<number, CardPos>()

  if (stage === 'observed') {
    const g1 = cases.filter(c => c.group === 0).sort((a,b) => b.response - a.response)
    const g2 = cases.filter(c => c.group === 1).sort((a,b) => b.response - a.response)
    g1.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, g1.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    g2.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, g2.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    return pos
  }
  if (stage === 'pooling' || stage === 'pooled') {
    cases.forEach(c => { const {x,y,rotation} = pilePos(c.id, layout, pileCY); pos.set(c.id, {x,y,rotation,delay:0,faceDown:true}) })
    return pos
  }
  if (stage === 'shuffling') {
    const ph = shufflePhase < 1 ? 1 : shufflePhase
    cases.forEach(c => {
      const {x,y,rotation} = shufflePhasePos(c.id, ph, layout, pileCY)
      const delay = ph % 2 === 1 ? cardHash(c.id, ph * 7 + 99) * 55 : 0
      pos.set(c.id, {x,y,rotation,delay,faceDown:true})
    })
    return pos
  }
  if (stage === 'shuffled') {
    cases.forEach(c => { const {x,y,rotation} = shufflePhasePos(c.id, NUM_SH_PHASES, layout, pileCY); pos.set(c.id, {x,y,rotation,delay:0,faceDown:true}) })
    return pos
  }
  if (stage === 'reassigning') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id)).sort((a,b) => b.response - a.response)
    const g2Sim = cases.filter(c => !aSet.has(c.id)).sort((a,b) => b.response - a.response)
    g1Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left, layout, n1);      pos.set(c.id, {x,y,rotation:0,delay:dealDelay(i, n),faceDown:true}) })
    g2Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:dealDelay(n1 + i, n),faceDown:true}) })
    return pos
  }
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

function colStats(cases: TwoProportionData['cases'], group: 0|1, assignment: number[]|null, stage: AnimStage) {
  const useObs = stage === 'observed' || stage === 'pooling'
  let members: typeof cases
  if (useObs) members = cases.filter(c => c.group === group)
  else if (assignment) {
    const s = new Set(assignment)
    members = group === 0 ? cases.filter(c => s.has(c.id)) : cases.filter(c => !s.has(c.id))
  } else return {n:0,s:0,p:0}
  const n = members.length, s = members.filter(c => c.response === 1).length
  return {n, s, p: n > 0 ? s/n : 0}
}

function getNullDistributionSummary(data: TwoProportionData) {
  const N = data.n1 + data.n2
  if (N <= 1) return { mean: 0, sd: 0 }
  const pPool = (data.s1 + data.s2) / N
  const variance = pPool * (1 - pPool) * (1 / data.n1 + 1 / data.n2) * ((N - data.n1) / (N - 1))
  return { mean: 0, sd: Math.sqrt(Math.max(0, variance)) }
}

// ── Null distribution plot ────────────────────────────────────────────────────

function NullDistPlot({ values, diffObs, alternative, showNormalCurve = false }: {
  values: number[]; diffObs: number; alternative: Alternative; showNormalCurve?: boolean
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 42, l: 16 }
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
  const xMin = -axisHalfRange, xMax = axisHalfRange
  const xSpan = Math.max(1e-9, xMax - xMin)
  const xOf = (v: number) => ((v - xMin) / xSpan) * PW

  const tickValues = Array.from({ length: 5 }, (_, i) => xMin + (xSpan * i) / 4)
  const tickLabel = (value: number) => {
    const rounded = Math.abs(value) < 0.0005 ? 0 : value
    return rounded.toFixed(axisHalfRange < 0.1 ? 2 : 1)
  }

  const stackCounts = new Map<number, number>()
  normalizedValues.forEach(v => { stackCounts.set(v, (stackCounts.get(v) ?? 0) + 1) })
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
  if (alternative === 'greater') shade=`M${obsX},0 H${PW} V${PH} H${obsX} Z`
  else if (alternative === 'less') shade=`M0,0 H${obsX} V${PH} H0 Z`
  else { const xL=xOf(-Math.abs(diffObs)),xR=xOf(Math.abs(diffObs)); shade=`M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z` }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop-full{from{transform:translateY(-${PH}px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH}/></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shade} fill="var(--color-gold)" opacity={0.10}/>
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="var(--color-text)" strokeWidth={1.5}/>
        {tickValues.map(v => (
          <g key={v} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="var(--color-muted)" strokeWidth={1}/>
            <text y={12} textAnchor="middle" fontSize={8} fill="var(--color-muted)" fontFamily="DM Sans,sans-serif">{tickLabel(v)}</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circles.map((c,i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR} fill={c.extreme?'var(--color-gold)':'var(--color-accent)'} opacity={0.85}
              style={i===circles.length-1&&values.length>0?{animation:'dot-drop-full 700ms ease-out'}:undefined}/>
          ))}
          {normalPath && (
            <polyline points={normalPath} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
          )}
        </g>
        <line x1={obsX} y1={0} x2={obsX} y2={PH} stroke="var(--color-gold)" strokeWidth={1.8} strokeDasharray="4,3"/>
        <text x={obsX+(diffObs>=0?3:-3)} y={5} textAnchor={diffObs>=0?'start':'end'} fontSize={8} fill="var(--color-gold-text)" fontFamily="DM Sans,sans-serif" fontWeight="600">obs</text>
        <text x={PW/2} y={PH+30} textAnchor="middle" fontSize={9} fill="var(--color-muted)" fontFamily="DM Sans,sans-serif">Simulated p̂₁ − p̂₂</text>
      </g>
    </svg>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
          <input type="number" min={0} step={1} value={numValue} onChange={e=>onChangeNum(e.target.value)} placeholder=" "
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] [appearance:textfield]"/>
          <div className="my-0.5 w-[4.5rem] border-t-2 border-[var(--color-text)]"/>
          <input type="number" min={1} step={1} value={denValue} onChange={e=>onChangeDen(e.target.value)} placeholder=" "
            className="w-16 text-center rounded-lg border border-[var(--color-border)] px-1 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] [appearance:textfield]"/>
        </div>
      </div>
      <div className="text-sm text-[var(--color-muted)]">= <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{phat}</span></div>
    </div>
  )
}

const CAPTIONS: Record<AnimStage,string> = {
  observed:    'Observed data',
  pooling:     'Pooling cases…',
  pooled:      'Pooled — ready to shuffle',
  shuffling:   'Shuffling…',
  shuffled:    'Shuffled — ready to reassign',
  reassigning: 'Dealing one by one…',
  reassigned:  'Assigned face-down — ready to compute',
  computing:   'Simulated proportions revealed',
  plotting:    'Recording on null distribution…',
  done:        'Done',
}

const ANIM_STEPS: { label: string; active: AnimStage[]; next: AnimStage }[] = [
  { label: '1. Pool',     active: ['observed','done'], next: 'pooling'    },
  { label: '2. Shuffle',  active: ['pooled'],          next: 'shuffling'  },
  { label: '3. Reassign', active: ['shuffled'],        next: 'reassigning'},
  { label: '4. Compute',  active: ['reassigned'],      next: 'computing'  },
  { label: '5. Record',   active: ['computing'],       next: 'plotting'   },
]

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  cardId: string
  config: TwoPropRandomizationCardConfig
  onClearZone: (z: string) => void
  onAssignZone: (zone: 'var1' | 'var2', colId: string) => boolean
}

export function TwoPropRandomizationTest({ cardId, config, onClearZone, onAssignZone }: Props) {
  const { grid, updateExploreCard } = useStore()

  // All config-backed values
  const cardStage     = config.stage       ?? 'setup'
  const sourceMode    = config.sourceMode  ?? 'manual'
  const successLevel  = config.successLevel ?? ''
  const groupA        = config.groupA      ?? ''
  const groupB        = config.groupB      ?? ''
  const manualS1      = config.manualS1    ?? ''
  const manualN1      = config.manualN1    ?? ''
  const manualS2      = config.manualS2    ?? ''
  const manualN2      = config.manualN2    ?? ''
  const manualLabel1  = config.manualLabel1 ?? 'Group 1'
  const manualLabel2  = config.manualLabel2 ?? 'Group 2'
  const alternative   = config.alternative ?? 'less'
  const nullDiff      = config.nullDiff    ?? '0'
  const nullDist      = config.nullDist    ?? []
  const simCount      = config.simCount    ?? 0
  const extremeCount  = config.extremeCount ?? 0
  const showNormalCurve = config.showNormalCurve ?? false

  function patchConfig(partial: Partial<TwoPropRandomizationCardConfig>) {
    updateExploreCard(cardId, {
      config: {
        ...config,
        stage: cardStage, sourceMode, successLevel, groupA, groupB,
        manualS1, manualN1, manualS2, manualN2, manualLabel1, manualLabel2,
        alternative, nullDiff, nullDist, simCount, extremeCount, showNormalCurve,
        ...partial,
      },
    })
  }

  // Card sizing — resize whenever stage changes
  const cardSizeTarget = cardStage === 'setup'
    ? { width: 820, height: 640 }
    : { width: 1380, height: 760 }

  useEffect(() => {
    updateExploreCard(cardId, cardSizeTarget)
  }, [cardId, cardSizeTarget.height, cardSizeTarget.width, updateExploreCard]) // eslint-disable-line

  // Local animation state
  const [animStage,    setAnimStage]    = useState<AnimStage>('observed')
  const [shufflePhase, setShufflePhase] = useState(0)
  const [assignment,   setAssignment]   = useState<number[]>([])
  const [currentResult,setCurrentResult]= useState<TwoProportionResult | null>(null)
  const [highlightSim, setHighlightSim] = useState(false)
  const [isRunning,    setIsRunning]    = useState(false)
  const cancelRef  = useRef(false)
  const resultRef  = useRef<TwoProportionResult | null>(null)
  const dataRef    = useRef<TwoProportionData | null>(null)
  const altRef     = useRef(alternative)
  useEffect(() => { altRef.current = alternative }, [alternative])

  // Derived data
  const responseCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const groupCol    = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null

  const responseLevels = useMemo(() =>
    config.var1ColId
      ? [...new Set(grid.rows.map(r => String(r[config.var1ColId!] ?? '').trim()).filter(Boolean))].sort()
      : [],
    [grid.rows, config.var1ColId])

  const groupLevels = useMemo(() =>
    config.var2ColId
      ? [...new Set(grid.rows.map(r => String(r[config.var2ColId!] ?? '').trim()).filter(Boolean))].sort()
      : [],
    [grid.rows, config.var2ColId])

  useEffect(() => {
    if (responseLevels.length > 0 && !successLevel)
      patchConfig({ successLevel: responseLevels[0] })
  }, [responseLevels]) // eslint-disable-line

  useEffect(() => {
    if (groupLevels.length >= 2) {
      const nextA = groupA && groupLevels.includes(groupA) ? groupA : groupLevels[0]
      const nextB = groupB && groupLevels.includes(groupB) && groupB !== nextA ? groupB : (groupLevels.find(g => g !== nextA) ?? '')
      if (nextA !== groupA || nextB !== groupB) patchConfig({ groupA: nextA, groupB: nextB })
    }
  }, [groupLevels]) // eslint-disable-line

  const data = useMemo<TwoProportionData | null>(() => {
    if (sourceMode === 'manual') {
      const n1=parseInt(manualN1,10), s1=parseInt(manualS1,10)
      const n2=parseInt(manualN2,10), s2=parseInt(manualS2,10)
      if (![n1,s1,n2,s2].every(Number.isFinite) || n1<=0 || n2<=0 || s1<0 || s2<0 || s1>n1 || s2>n2) return null
      return buildTwoProportionData(n1, s1, n2, s2, manualLabel1.trim()||'Group 1', manualLabel2.trim()||'Group 2', 'Success', 'Failure')
    }
    if (!config.var1ColId || !config.var2ColId || !successLevel || !groupA || !groupB) return null
    let n1=0, s1=0, n2=0, s2=0
    for (const row of grid.rows) {
      const resp = String(row[config.var1ColId] ?? '').trim()
      const grp  = String(row[config.var2ColId] ?? '').trim()
      if (!resp || !grp) continue
      if (grp === groupA)      { n1++; if (resp === successLevel) s1++ }
      else if (grp === groupB) { n2++; if (resp === successLevel) s2++ }
    }
    if (n1===0 || n2===0) return null
    return buildTwoProportionData(n1, s1, n2, s2, groupA, groupB, successLevel, 'Not '+successLevel)
  }, [config.var1ColId, config.var2ColId, grid.rows, groupA, groupB, manualN1, manualN2, manualS1, manualS2, manualLabel1, manualLabel2, sourceMode, successLevel])

  useEffect(() => { dataRef.current = data }, [data])

  const pValue      = simCount > 0 ? extremeCount / simCount : null
  const nullSummary = useMemo(() => data ? getNullDistributionSummary(data) : { mean: 0, sd: 0 }, [data])

  // Animation layout
  const cases        = data?.cases ?? []
  const layout       = getCardLayout(cases.length)
  const canvasH      = data ? getCanvasHeight(data.n1, data.n2) : 118
  const pileCY       = HEADER_H + (canvasH - HEADER_H) / 2
  const isAnimating  = ['pooling','shuffling','reassigning','plotting'].includes(animStage)
  const cardTransDur = animStage === 'shuffling' ? SHUFFLE_DUR : animStage === 'reassigning' ? DEAL_DUR : POOL_DUR

  const positions = useMemo(
    () => data ? computePositions(data, animStage, assignment, shufflePhase, pileCY) : new Map<number, CardPos>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, animStage, assignment, shufflePhase, pileCY]
  )

  // Stage machine
  useEffect(() => {
    if (!['pooling','reassigning'].includes(animStage)) return
    const id = animStage === 'pooling'
      ? setTimeout(() => setAnimStage('pooled'), POOL_DUR + 80)
      : setTimeout(() => setAnimStage('reassigned'), dealStaggerMax(cases.length) + DEAL_DUR + 120)
    return () => clearTimeout(id)
  }, [animStage, cases.length])

  useEffect(() => {
    if (animStage !== 'shuffling') { if (shufflePhase !== 0) setShufflePhase(0); return }
    if (shufflePhase === 0) return
    const id = setTimeout(() => {
      if (shufflePhase >= NUM_SH_PHASES) { setAnimStage('shuffled'); setShufflePhase(0) }
      else setShufflePhase(p => p + 1)
    }, SHUFFLE_DUR + 15)
    return () => clearTimeout(id)
  }, [animStage, shufflePhase])

  function handleStep() {
    if (isAnimating || isRunning || !data) return
    if (animStage === 'observed' || animStage === 'done') { setAnimStage('pooling') }
    else if (animStage === 'pooled')   { setAnimStage('shuffling'); setShufflePhase(1) }
    else if (animStage === 'shuffled') {
      const result = runTwoProportionRandomization(data)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result); setAnimStage('reassigning')
    }
    else if (animStage === 'reassigned') { setHighlightSim(true); setAnimStage('computing') }
    else if (animStage === 'computing')  {
      setHighlightSim(false); setAnimStage('plotting')
      const result = resultRef.current
      if (!result) return
      window.setTimeout(() => {
        const newDist    = [...nullDist, result.diffSim]
        const newCount   = simCount + 1
        const newExtreme = extremeCount + (isExtremeResult(result.diffSim, data.diffObs, alternative) ? 1 : 0)
        patchConfig({ nullDist: newDist, simCount: newCount, extremeCount: newExtreme })
        setAnimStage('done')
      }, 320)
    }
  }

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  async function runAnimated(count: number) {
    if (isRunning || isAnimating || !data) return
    cancelRef.current = false; setIsRunning(true)
    let localDist = [...nullDist], localCount = simCount, localExtreme = extremeCount
    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break
      setHighlightSim(false); setAnimStage('pooling')
      await sleep(POOL_DUR + 100); if (cancelRef.current) break
      setAnimStage('shuffling'); setShufflePhase(1)
      await sleep(NUM_SH_PHASES * (SHUFFLE_DUR + 15) + 40); if (cancelRef.current) break
      const result = runTwoProportionRandomization(dataRef.current!)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result)
      setAnimStage('reassigning')
      await sleep(dealStaggerMax(dataRef.current!.cases.length) + DEAL_DUR + 140); if (cancelRef.current) break
      setHighlightSim(true); setAnimStage('computing')
      await sleep(220); if (cancelRef.current) break
      setHighlightSim(false); setAnimStage('plotting')
      await sleep(320); if (cancelRef.current) break
      localDist = [...localDist, result.diffSim]; localCount += 1
      localExtreme += isExtremeResult(result.diffSim, dataRef.current!.diffObs, altRef.current) ? 1 : 0
      patchConfig({ nullDist: localDist, simCount: localCount, extremeCount: localExtreme })
      setAnimStage('done')
      if (i < count - 1) await sleep(40)
    }
    setIsRunning(false); cancelRef.current = false
  }

  function runBatch(count: number) {
    if (isRunning || isAnimating || !data) return
    const diffs: number[] = []; let newExtreme = 0; let last: TwoProportionResult | null = null
    for (let i = 0; i < count; i++) {
      const r = runTwoProportionRandomization(data)
      last = r; diffs.push(r.diffSim)
      if (isExtremeResult(r.diffSim, data.diffObs, alternative)) newExtreme++
    }
    if (last) { setAssignment(last.assignment); setCurrentResult(last) }
    setAnimStage('done')
    patchConfig({ nullDist: [...nullDist, ...diffs], simCount: simCount + count, extremeCount: extremeCount + newExtreme })
  }

  function handleClear() {
    cancelRef.current = true; setIsRunning(false)
    setAnimStage('observed'); setShufflePhase(0); setAssignment([]); setCurrentResult(null); setHighlightSim(false)
    patchConfig({ nullDist: [], simCount: 0, extremeCount: 0 })
  }

  function handleNativeDrop(zone: 'var1'|'var2') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return; e.preventDefault(); onAssignZone(zone, colId)
    }
  }
  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }

  // Overlay visible during manual stepping
  const overlayVisible = !isRunning && animStage !== 'observed' && animStage !== 'done'

  // Display state
  const showSplit    = !['pooling','pooled','shuffling','shuffled','reassigning'].includes(animStage)
  const showCenter   = ['pooling','pooled','shuffling','shuffled','reassigning'].includes(animStage)
  const showFaceUp   = ['computing','plotting','done'].includes(animStage)
  const showColStats = showSplit && showFaceUp
  const leftStats    = colStats(cases, 0, showFaceUp ? assignment : null, animStage)
  const rightStats   = colStats(cases, 1, showFaceUp ? assignment : null, animStage)
  const altSymbol    = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const label1       = sourceMode === 'manual' ? (manualLabel1.trim() || 'Group 1') : (groupA || 'Group 1')
  const label2       = sourceMode === 'manual' ? (manualLabel2.trim() || 'Group 2') : (groupB || 'Group 2')
  const successLbl   = sourceMode === 'manual' ? 'Success' : successLevel

  // Stepper
  const hasEnoughToConclude = simCount >= 100
  const stepLabels = [
    { key: 'setup' as CardStage,    label: 'Set up',   enabled: true },
    { key: 'simulate' as CardStage, label: 'Simulate', enabled: true },
    { key: 'conclude' as CardStage, label: 'Conclude', enabled: hasEnoughToConclude },
  ]
  const stepper = (
    <div className="flex flex-wrap items-center gap-3 md:flex-nowrap md:gap-4">
      {stepLabels.map((step, index) => {
        const active = cardStage === step.key
        return (
          <div key={step.key} className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" disabled={!step.enabled}
              onClick={() => step.enabled && patchConfig({ stage: step.key })}
              className="flex items-center gap-3 disabled:cursor-not-allowed">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                active ? 'bg-[var(--color-accent)] text-white'
                  : step.enabled ? 'bg-[var(--color-accent-light)] text-[var(--color-muted)]'
                  : 'bg-[var(--color-border)] text-[var(--color-muted)] opacity-50'
              }`}>{index + 1}</span>
              <span className={`text-sm font-semibold transition-colors ${
                active ? 'text-[var(--color-text)]'
                  : step.enabled ? 'text-[var(--color-muted)]'
                  : 'text-[var(--color-muted)] opacity-40'
              }`}>{step.label}</span>
            </button>
            {index < stepLabels.length - 1 && <div className="hidden h-px flex-1 bg-[var(--color-border)] md:block"/>}
          </div>
        )
      })}
    </div>
  )

  // ── Setup stage ──────────────────────────────────────────────────────────────

  if (cardStage === 'setup') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="space-y-4 px-2 py-1">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--color-text)] px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.24em] text-white">
              Inference
            </div>
          </div>
          {stepper}
          <div className="text-sm font-serif italic leading-snug text-[var(--color-text)]">
            Is there a real difference, or could chance explain the gap?
          </div>

          <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4">
            {/* Source toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted)]">Source</span>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                {(['data','manual'] as const).map((m,i) => (
                  <button key={m} onClick={() => patchConfig({ sourceMode: m })}
                    className={`px-2.5 py-1 font-medium transition-colors ${i>0?'border-l border-[var(--color-border)]':''} ${sourceMode===m?'bg-[var(--color-text)] text-[var(--color-surface)]':'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]'}`}>
                    {m === 'data' ? 'Use data' : 'Enter info'}
                  </button>
                ))}
              </div>
            </div>

            {sourceMode === 'data' ? (
              <>
                <div className="flex gap-2">
                  <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
                    <DropZone id={`${cardId}:var1`} label="Response Variable" hint="categorical only" assignedCol={responseCol} onClear={() => onClearZone('var1')} onAssign={colId => onAssignZone('var1', colId)} allowedTypes={['categorical']}/>
                  </div>
                  <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
                    <DropZone id={`${cardId}:var2`} label="Group By" hint="categorical only" assignedCol={groupCol} onClear={() => onClearZone('var2')} onAssign={colId => onAssignZone('var2', colId)} allowedTypes={['categorical']}/>
                  </div>
                </div>
                {responseLevels.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
                    <select value={successLevel} onChange={e => patchConfig({ successLevel: e.target.value })}
                      className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]">
                      {responseLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}
                {groupLevels.length > 2 && (
                  <div className="flex gap-2">
                    {(['Compare','vs.'] as const).map((lbl,idx) => {
                      const [val, other] = idx === 0 ? [groupA, groupB] : [groupB, groupA]
                      return (
                        <div key={lbl} className="flex-1 flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                          <select value={val} onChange={e => patchConfig(idx===0?{groupA:e.target.value}:{groupB:e.target.value})}
                            className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-[var(--color-surface)]">
                            {groupLevels.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )}
                {data && (
                  <div className="rounded-xl bg-[var(--color-accent-light)] border border-[var(--color-border)] px-4 py-2 text-sm space-y-1.5">
                    <div className="text-[var(--color-muted)]">
                      Success: <span className="font-semibold text-[var(--color-text)]">{successLevel}</span>
                    </div>
                    <div className="text-[var(--color-muted)]">
                      <span className="font-semibold text-[var(--color-text)]">{data.group1Label}</span>: p̂₁ = {data.s1}/{data.n1} = <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{data.p1.toFixed(3)}</span>
                      <span className="mx-3">|</span>
                      <span className="font-semibold text-[var(--color-text)]">{data.group2Label}</span>: p̂₂ = {data.s2}/{data.n2} = <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{data.p2.toFixed(3)}</span>
                    </div>
                    <div className="text-[var(--color-muted)]">
                      p̂₁ − p̂₂ = <span className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{data.diffObs.toFixed(3)}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Group 1 name</label>
                    <input value={manualLabel1} onChange={e => patchConfig({ manualLabel1: e.target.value })} placeholder="Group 1"
                      className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]"/>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-muted)] mb-1">Group 2 name</label>
                    <input value={manualLabel2} onChange={e => patchConfig({ manualLabel2: e.target.value })} placeholder="Group 2"
                      className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]"/>
                  </div>
                </div>
                <div className="flex items-center justify-around py-1">
                  <FractionInput label="p̂₁" numLabel="x₁" denLabel="n₁" numValue={manualS1} denValue={manualN1}
                    onChangeNum={v => patchConfig({ manualS1: v })} onChangeDen={v => patchConfig({ manualN1: v })}/>
                  <div className="w-px h-20 bg-[var(--color-border)]"/>
                  <FractionInput label="p̂₂" numLabel="x₂" denLabel="n₂" numValue={manualS2} denValue={manualN2}
                    onChangeNum={v => patchConfig({ manualS2: v })} onChangeDen={v => patchConfig({ manualN2: v })}/>
                </div>
                {data && (
                  <div className="rounded-xl bg-[var(--color-accent-light)] border border-[var(--color-border)] px-4 py-2 text-center text-sm">
                    <span className="text-[var(--color-muted)]">p̂₁ − p̂₂ = {data.p1.toFixed(3)} − {data.p2.toFixed(3)} = </span>
                    <span className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{data.diffObs.toFixed(3)}</span>
                  </div>
                )}
              </div>
            )}

            {/* H₀ / Hₐ */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Hypotheses</div>
              <div className="inline-flex rounded-[20px] bg-[var(--color-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-[var(--color-text)]">
                  <span>H₀ : p₁ − p₂ =</span>
                  <input type="number" min={-1} max={1} step={0.01} value={nullDiff}
                    onChange={e => patchConfig({ nullDiff: e.target.value })}
                    className="w-20 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center text-sm font-semibold text-[var(--color-text)] shadow-sm"/>
                  <span className="ml-2">Hₐ : p₁ − p₂</span>
                  <select value={alternative} onChange={e => patchConfig({ alternative: e.target.value as Alternative })}
                    className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-text)] shadow-sm">
                    <option value="less">&lt;</option>
                    <option value="greater">&gt;</option>
                    <option value="two">≠</option>
                  </select>
                  <span className="font-mono tabular-nums">{nullDiff}</span>
                </div>
              </div>
            </div>
          </div>

          <button onClick={() => patchConfig({ stage: 'simulate' })} disabled={!data}
            className="rounded-[18px] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
            Start simulating →
          </button>
        </div>
      </div>
    )
  }

  // ── Simulate / Conclude stage ─────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* Row 1: stepper + ← Edit setup */}
      <div className="flex-shrink-0 flex items-center gap-4 pb-3 border-b border-[var(--color-border)]">
        <div className="flex-1 min-w-0">{stepper}</div>
        <button type="button" onClick={() => patchConfig({ stage: 'setup' })}
          className="flex-shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]">
          ← Edit setup
        </button>
      </div>

      {/* Row 2: observed strip */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 py-2.5">
        <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
          H₀: p₁ − p₂ = <span className="font-mono tabular-nums font-semibold">{nullDiff}</span>
        </div>
        <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
          Hₐ: p₁ − p₂ <span className="px-0.5 font-semibold">{altSymbol}</span> <span className="font-mono tabular-nums font-semibold">{nullDiff}</span>
        </div>
        {data && (
          <>
            <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
              <span className="font-semibold">{label1}</span>: p̂₁ = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{data.p1.toFixed(3)}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
              <span className="font-semibold">{label2}</span>: p̂₂ = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{data.p2.toFixed(3)}</span>
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
              p̂₁ − p̂₂ = <span className="font-mono tabular-nums font-semibold text-[var(--color-gold)]">{data.diffObs.toFixed(3)}</span>
            </div>
          </>
        )}
        <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text)]">
          Reps = <span className="font-mono tabular-nums font-semibold">{simCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Row 3: action bar */}
      <div className="flex-shrink-0 flex items-center gap-2 py-2 border-t border-b border-[var(--color-border)]">
        {/* Step buttons */}
        <div className="flex items-center gap-1.5">
          {ANIM_STEPS.map(step => {
            const active = step.active.includes(animStage) && !isAnimating && !isRunning
            return (
              <button key={step.label} onClick={handleStep} disabled={!active}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--color-accent)] text-white hover:brightness-105'
                    : 'border border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-surface)] cursor-not-allowed opacity-40'
                }`}>
                {step.label}
              </button>
            )
          })}
        </div>

        {/* Micro-copy */}
        <div className="flex-1 min-w-0 px-2">
          {simCount >= 1 && animStage === 'done' && !isRunning ? (
            <p className="text-sm text-[var(--color-muted)]">
              Another? <strong className="font-semibold text-[var(--color-text)]">1. Pool</strong> again — or speed up with +10 / +100 / +1,000.
            </p>
          ) : isRunning ? (
            <p className="text-sm text-[var(--color-muted)]">Running…</p>
          ) : null}
        </div>

        {/* Speed up */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-[0.1em]">Speed up</span>
          {simCount > 0 && ([10, 100, 1000] as const).map(cnt => (
            <button key={cnt}
              onClick={() => cnt === 10 ? runAnimated(cnt) : runBatch(cnt)}
              disabled={isRunning || isAnimating}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              +{cnt.toLocaleString()}
            </button>
          ))}
          {isRunning ? (
            <button onClick={() => { cancelRef.current = true }}
              className="rounded-lg border border-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors">
              Stop
            </button>
          ) : simCount > 0 ? (
            <button onClick={handleClear}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-light)] transition-colors">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Row 4: eyebrow */}
      <div className="flex-shrink-0 pt-2 pb-0.5">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
          Null distribution — {simCount.toLocaleString()} repetition{simCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Row 5: main area */}
      <div className="flex-1 min-h-0 flex gap-4">

        {/* Left: null distribution plot + transient shuffle overlay */}
        <div className="relative flex-1 min-w-0 min-h-0">
          {simCount === 0 && !overlayVisible ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
              Click <strong className="mx-1 font-semibold text-[var(--color-text)]">1. Pool</strong> above to start.
            </div>
          ) : (
            <NullDistPlot values={nullDist} diffObs={data?.diffObs ?? 0} alternative={alternative} showNormalCurve={showNormalCurve}/>
          )}

          {/* Transient overlay — slides up during manual stepping */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden px-4 py-4 transition-all duration-300 ease-in-out ${
            overlayVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
          }`}>

            {/* Eyebrow label */}
            <div className="flex-shrink-0 flex items-center justify-between w-full" style={{ maxWidth: CANVAS_W }}>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {CAPTIONS[animStage]}
              </span>
              <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded-sm bg-[var(--color-accent)] flex-shrink-0" style={{width:8,height:13}}/>
                  {successLbl}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded-sm bg-[var(--color-border)] flex-shrink-0" style={{width:8,height:13}}/>
                  not {successLbl}
                </span>
              </div>
            </div>

            {/* Card animation canvas */}
            <div className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden" style={{ width: CANVAS_W }}>
              {/* Header row */}
              <div className="relative bg-[var(--color-bg)] border-b border-[var(--color-border)]" style={{width:CANVAS_W, height:HEADER_H}}>
                <span style={{position:'absolute',left:COL_CX.left,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{label1}</span>
                {showCenter && <span style={{position:'absolute',left:COL_CX.center,top:'50%',transform:'translate(-50%,-50%)',fontSize:11,color:'var(--color-muted)'}}>Pooled</span>}
                <span style={{position:'absolute',left:COL_CX.right,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{label2}</span>
                {showColStats && (
                  <>
                    <ColStatLabel cx={COL_CX.left}  n={leftStats.n}  s={leftStats.s}  p={leftStats.p}  highlight={highlightSim} layout={layout}/>
                    <ColStatLabel cx={COL_CX.right} n={rightStats.n} s={rightStats.s} p={rightStats.p} highlight={highlightSim} layout={layout}/>
                  </>
                )}
              </div>
              {/* Card area */}
              <div className="relative bg-[var(--color-surface)] overflow-hidden" style={{width:CANVAS_W,height:canvasH,transition:'height 400ms ease'}}>
                <div className="absolute inset-y-0 transition-all duration-500" style={{
                  left:COL_CX.left-COL_W/2-4,width:COL_W+8,
                  background:showSplit?'rgba(var(--color-accent-rgb,22,168,155),0.04)':'transparent',
                  borderRight:showSplit?'1px dashed var(--color-border)':'none',
                }}/>
                <div className="absolute inset-y-0 transition-all duration-500" style={{
                  left:COL_CX.right-COL_W/2-4,width:COL_W+8,
                  background:showSplit?'rgba(var(--color-accent-rgb,22,168,155),0.04)':'transparent',
                  borderLeft:showSplit?'1px dashed var(--color-border)':'none',
                }}/>
                {cases.map(c => {
                  const p   = positions.get(c.id) ?? {x:-50,y:-50,rotation:0,delay:0,faceDown:false}
                  const fd  = p.faceDown
                  const isSuccess = c.response === 1
                  const bg  = fd ? 'var(--color-accent-strong)' : isSuccess ? 'var(--color-accent)' : 'var(--color-border)'
                  const bdr = fd ? 'var(--color-accent-strong)' : isSuccess ? 'var(--color-accent-strong)' : 'var(--color-border)'
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
            </div>

            {/* CTA button */}
            {animStage !== 'plotting' && (
              <button onClick={handleStep}
                disabled={isAnimating || !ANIM_STEPS.some(s => s.active.includes(animStage))}
                className="rounded-xl bg-[var(--color-accent)] px-8 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-40 transition-colors">
                {animStage === 'pooled'    ? '2. Shuffle →'
                : animStage === 'shuffled' ? '3. Reassign →'
                : animStage === 'reassigned' ? '4. Compute →'
                : animStage === 'computing'  ? '5. Record →'
                : '→'}
              </button>
            )}

            {/* Sim result line */}
            {currentResult && showFaceUp && (
              <p className="text-sm text-[var(--color-muted)] text-center">
                <span className="font-semibold text-[var(--color-text)]">{label1}</span> {currentResult.s1Sim}/{data?.n1} = <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{currentResult.p1Sim.toFixed(3)}</span>
                {' · '}
                <span className="font-semibold text-[var(--color-text)]">{label2}</span> {currentResult.s2Sim}/{data?.n2} = <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{currentResult.p2Sim.toFixed(3)}</span>
                {' → p̂₁ − p̂₂ = '}
                <span className="font-mono tabular-nums font-bold text-[var(--color-gold)]">{currentResult.diffSim.toFixed(3)}</span>
                {data && isExtremeResult(currentResult.diffSim, data.diffObs, alternative) && <span className="ml-1 text-[var(--color-gold)]">★</span>}
              </p>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[200px] flex-shrink-0 flex flex-col gap-4">

          {/* Normal curve toggle */}
          <label className="flex items-center gap-2 select-none text-sm text-[var(--color-text)]">
            <input type="checkbox" checked={showNormalCurve}
              onChange={e => patchConfig({ showNormalCurve: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"/>
            <span>Overlay normal curve</span>
          </label>
          <div className="text-xs text-[var(--color-muted)] -mt-2 leading-tight">
            <div>Mean = <span className="font-mono tabular-nums">{nullSummary.mean.toFixed(3)}</span></div>
            <div>SD = <span className="font-mono tabular-nums">{nullSummary.sd.toFixed(3)}</span></div>
          </div>

          {/* p-value */}
          <div>
            <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] mb-1.5">p-value</div>
            <div className="font-mono tabular-nums font-bold text-[var(--color-gold)]" style={{ fontSize: '1.75rem', lineHeight: 1.1 }}>
              {simCount < 100 || pValue === null ? '—' : pValue < 0.001 ? '< 0.001' : pValue.toFixed(3)}
            </div>
          </div>

          {/* Extreme count */}
          {simCount < 100 ? (
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              Build at least <strong className="font-mono font-bold">100</strong> repetitions to read a p-value.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              <strong className="font-mono font-bold">{extremeCount.toLocaleString()}</strong>{' '}of the{' '}
              <strong className="font-mono font-bold">{simCount.toLocaleString()}</strong>{' '}
              simulated results were as or more extreme.
            </p>
          )}

          {cardStage === 'conclude' && (
            <button type="button" onClick={() => patchConfig({ stage: 'simulate' })}
              className="mt-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]">
              ← Simulate more
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── TwoPropSimCard — preserved for legacy saves ───────────────────────────────

export function TwoPropSimCard({ cardId, config }: { cardId: string; config: TwoPropSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const data = useMemo(() =>
    buildTwoProportionData(config.n1, config.s1, config.n2, config.s2,
      config.label1, config.label2, config.successLabel, config.failureLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.n1, config.s1, config.n2, config.s2, config.label1, config.label2, config.successLabel, config.failureLabel])

  const [animStage,    setAnimStage]     = useState<AnimStage>('observed')
  const [shufflePhase, setShufflePhase]  = useState(0)
  const [assignment,   setAssignment]    = useState<number[]>([])
  const [currentResult,setCurrentResult] = useState<TwoProportionResult | null>(null)
  const [highlightSim, setHighlightSim]  = useState(false)
  const [isRunning,    setIsRunning]     = useState(false)

  const nullDist     = config.nullDist
  const simCount     = config.simCount
  const extremeCount = config.extremeCount
  const alternative  = config.alternative
  const nullDiff     = config.nullDiff

  const cases        = data.cases
  const layout       = getCardLayout(cases.length)
  const canvasH      = getCanvasHeight(data.n1, data.n2)
  const pileCY       = HEADER_H + (canvasH - HEADER_H) / 2
  const isAnimating  = ['pooling','shuffling','reassigning','plotting'].includes(animStage)
  const pValue       = simCount > 0 ? extremeCount / simCount : null
  const positions    = computePositions(data, animStage, assignment, shufflePhase, pileCY)
  const cardTransDur = animStage === 'shuffling' ? SHUFFLE_DUR : animStage === 'reassigning' ? DEAL_DUR : POOL_DUR
  const showNormalCurve = config.showNormalCurve ?? false
  const nullSummary  = useMemo(() => getNullDistributionSummary(data), [data])

  const dataRef    = useRef(data)
  const altRef     = useRef(alternative)
  const resultRef  = useRef<TwoProportionResult | null>(null)
  const cancelRef  = useRef(false)
  useEffect(()=>{ dataRef.current=data },[data])
  useEffect(()=>{ altRef.current=alternative },[alternative])

  useEffect(() => {
    if (!['pooling','reassigning'].includes(animStage)) return
    const id = animStage === 'pooling'
      ? setTimeout(() => setAnimStage('pooled'), POOL_DUR + 80)
      : setTimeout(() => setAnimStage('reassigned'), dealStaggerMax(data.cases.length) + DEAL_DUR + 120)
    return () => clearTimeout(id)
  }, [animStage, data.cases.length])

  useEffect(() => {
    if (animStage !== 'shuffling') { if (shufflePhase !== 0) setShufflePhase(0); return }
    if (shufflePhase === 0) return
    const id = setTimeout(() => {
      if (shufflePhase >= NUM_SH_PHASES) { setAnimStage('shuffled'); setShufflePhase(0) }
      else setShufflePhase(p => p + 1)
    }, SHUFFLE_DUR + 15)
    return () => clearTimeout(id)
  }, [animStage, shufflePhase])

  function handleStep() {
    if (isAnimating || isRunning) return
    if (animStage === 'observed' || animStage === 'done') { setAnimStage('pooling') }
    else if (animStage === 'pooled')    { setAnimStage('shuffling'); setShufflePhase(1) }
    else if (animStage === 'shuffled')  {
      const result = runTwoProportionRandomization(data)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result); setAnimStage('reassigning')
    }
    else if (animStage === 'reassigned') { setHighlightSim(true); setAnimStage('computing') }
    else if (animStage === 'computing')  {
      setHighlightSim(false); setAnimStage('plotting')
      const result = resultRef.current
      if (!result) return
      window.setTimeout(() => {
        updateExploreCard(cardId, { config: {
          ...config,
          nullDist: [...nullDist, result.diffSim],
          simCount: simCount + 1,
          extremeCount: extremeCount + (isExtremeResult(result.diffSim, data.diffObs, alternative) ? 1 : 0),
        }})
        setAnimStage('done')
      }, 320)
    }
  }

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  async function runAnimated(count: number) {
    if (isRunning || isAnimating) return
    cancelRef.current = false; setIsRunning(true)
    let localDist = [...nullDist], localCount = simCount, localExtreme = extremeCount
    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break
      setHighlightSim(false); setAnimStage('pooling')
      await sleep(POOL_DUR + 100); if (cancelRef.current) break
      setAnimStage('shuffling'); setShufflePhase(1)
      await sleep(NUM_SH_PHASES * (SHUFFLE_DUR + 15) + 40); if (cancelRef.current) break
      const result = runTwoProportionRandomization(dataRef.current!)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result)
      setAnimStage('reassigning')
      await sleep(dealStaggerMax(dataRef.current!.cases.length) + DEAL_DUR + 140); if (cancelRef.current) break
      setHighlightSim(true); setAnimStage('computing')
      await sleep(220); if (cancelRef.current) break
      setHighlightSim(false); setAnimStage('plotting')
      await sleep(320); if (cancelRef.current) break
      localDist = [...localDist, result.diffSim]; localCount += 1
      localExtreme += isExtremeResult(result.diffSim, dataRef.current!.diffObs, altRef.current) ? 1 : 0
      updateExploreCard(cardId, { config: { ...config, nullDist: localDist, simCount: localCount, extremeCount: localExtreme } })
      setAnimStage('done')
      if (i < count - 1) await sleep(40)
    }
    setIsRunning(false); cancelRef.current = false
  }

  function runBatch(count: number) {
    if (isRunning || isAnimating) return
    const diffs: number[] = []; let newExtreme = 0; let last: TwoProportionResult | null = null
    for (let i = 0; i < count; i++) {
      const r = runTwoProportionRandomization(data); last = r; diffs.push(r.diffSim)
      if (isExtremeResult(r.diffSim, data.diffObs, alternative)) newExtreme++
    }
    if (last) { setAssignment(last.assignment); setCurrentResult(last) }
    setAnimStage('done')
    updateExploreCard(cardId, { config: { ...config, nullDist: [...nullDist, ...diffs], simCount: simCount + count, extremeCount: extremeCount + newExtreme } })
  }

  function handleReset() {
    cancelRef.current = true; setIsRunning(false)
    setAnimStage('observed'); setShufflePhase(0); setAssignment([]); setCurrentResult(null); setHighlightSim(false)
    updateExploreCard(cardId, { config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 } })
  }

  const showSplit    = !['pooling','pooled','shuffling','shuffled','reassigning'].includes(animStage)
  const showCenter   = ['pooling','pooled','shuffling','shuffled','reassigning'].includes(animStage)
  const showFaceUp   = ['computing','plotting','done'].includes(animStage)
  const showColStats = showSplit && showFaceUp
  const leftStats    = colStats(cases, 0, showFaceUp ? assignment : null, animStage)
  const rightStats   = colStats(cases, 1, showFaceUp ? assignment : null, animStage)
  const altStatement = `p₁ − p₂ ${alternative==='less'?'<':alternative==='greater'?'>':'≠'} ${nullDiff}`
  const currentSimLine = currentResult
    ? `${config.label1}: ${currentResult.s1Sim}/${data.n1}=${currentResult.p1Sim.toFixed(3)}, ${config.label2}: ${currentResult.s2Sim}/${data.n2}=${currentResult.p2Sim.toFixed(3)}, diff=${currentResult.diffSim.toFixed(3)}${isExtremeResult(currentResult.diffSim,data.diffObs,alternative)?' ★':''}`
    : 'Run a simulation to see results.'

  const STEPS = [
    {label:'1. Pool',stages:['observed','done']},{label:'2. Shuffle',stages:['pooled']},
    {label:'3. Reassign',stages:['shuffled']},{label:'4. Compute',stages:['reassigned']},{label:'5. Record',stages:['computing']},
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2.5 text-xs text-[var(--color-muted)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span><span className="font-semibold text-[var(--color-text)]">H₀:</span> p₁ − p₂ = {nullDiff}</span>
            <span><span className="font-semibold text-[var(--color-text)]">Hₐ:</span> {altStatement}</span>
            <span><span className="font-semibold text-[var(--color-text)]">n₁:</span> {data.n1}</span>
            <span><span className="font-semibold text-[var(--color-text)]">n₂:</span> {data.n2}</span>
            <span><span className="font-semibold text-[var(--color-text)]">p̂₁−p̂₂:</span> <span className="font-mono tabular-nums font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span></span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="overflow-x-auto flex justify-center">
            <div className="w-fit">
              <div className="relative bg-[var(--color-bg)] border-b border-[var(--color-border)] flex-shrink-0" style={{width:CANVAS_W,height:HEADER_H}}>
                <span style={{position:'absolute',left:COL_CX.left,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label1}</span>
                {showCenter&&<span style={{position:'absolute',left:COL_CX.center,top:'50%',transform:'translate(-50%,-50%)',fontSize:11,color:'var(--color-muted)'}}>Pooled</span>}
                <span style={{position:'absolute',left:COL_CX.right,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label2}</span>
                {showColStats&&(<><ColStatLabel cx={COL_CX.left} n={leftStats.n} s={leftStats.s} p={leftStats.p} highlight={highlightSim} layout={layout}/><ColStatLabel cx={COL_CX.right} n={rightStats.n} s={rightStats.s} p={rightStats.p} highlight={highlightSim} layout={layout}/></>)}
              </div>
              <div className="relative bg-[var(--color-surface)] flex-shrink-0 overflow-hidden" style={{width:CANVAS_W,height:canvasH,transition:'height 400ms ease'}}>
                {cases.map(c => {
                  const p = positions.get(c.id) ?? {x:-50,y:-50,rotation:0,delay:0,faceDown:false}
                  const fd = p.faceDown; const isSuccess = c.response===1
                  const bg = fd?'var(--color-accent-strong)':isSuccess?'var(--color-accent)':'var(--color-border)'
                  const bdr = fd?'var(--color-accent-strong)':isSuccess?'var(--color-accent-strong)':'var(--color-border)'
                  return (<div key={c.id} style={{position:'absolute',left:p.x,top:p.y,width:layout.w,height:layout.h,transition:`left ${cardTransDur}ms ease-in-out,top ${cardTransDur}ms ease-in-out,transform ${cardTransDur}ms ease-in-out,background-color 160ms,border-color 160ms`,transitionDelay:`${p.delay}ms`,transform:`rotate(${p.rotation}deg)`,borderRadius:Math.max(2,Math.floor(layout.w/7)),backgroundColor:bg,border:`${Math.max(1,Math.floor(layout.w/14))}px solid ${bdr}`,boxShadow:fd?'0 2px 5px rgba(0,0,0,0.20)':'0 1px 2px rgba(0,0,0,0.10)',boxSizing:'border-box'}}/>)
                })}
              </div>
              <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5" style={{width:CANVAS_W}}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><span className="inline-block rounded-sm bg-[var(--color-accent)] flex-shrink-0" style={{width:8,height:13}}/>{config.successLabel}</div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><span className="inline-block rounded-sm bg-[var(--color-border)] flex-shrink-0" style={{width:8,height:13}}/>{config.failureLabel}</div>
                  <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">{CAPTIONS[animStage]}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs text-[var(--color-muted)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span><span className="font-semibold text-[var(--color-text)]">Obs:</span> {config.label1}: {data.s1}/{data.n1}={data.p1.toFixed(3)}, {config.label2}: {data.s2}/{data.n2}={data.p2.toFixed(3)}</span>
            <span><span className="font-semibold text-[var(--color-text)]">Sim:</span> {currentSimLine}</span>
            <span className="ml-auto"><span className="font-semibold text-[var(--color-text)]">Total:</span> {simCount.toLocaleString()}</span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex flex-col gap-1.5">
          <div className="flex gap-4 items-stretch">
            <div className="w-40 flex-shrink-0 flex flex-col gap-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
              <div className="flex flex-col items-start gap-2 text-xs text-[var(--color-muted)]">
                <label className="flex items-center gap-2 select-none">
                  <input type="checkbox" checked={showNormalCurve}
                    onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                    className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"/>
                  <span>Overlay normal curve</span>
                </label>
                <div className="pl-6 leading-tight"><div>Mean = {nullSummary.mean.toFixed(3)}</div><div>SD = {nullSummary.sd.toFixed(3)}</div></div>
                <div className="pt-2 leading-tight">
                  <div>Extreme: <span className="font-mono tabular-nums font-bold text-[var(--color-text)]">{extremeCount.toLocaleString()}</span> / {simCount.toLocaleString()}</div>
                  <div className="pt-1 font-semibold text-[var(--color-accent)]">{pValue!==null?`p ≈ ${pValue<0.001?'< 0.001':pValue.toFixed(4)}`:'p = —'}</div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0" style={{height:320}}>
              {simCount===0
                ?<div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">Run simulations to build the null distribution</div>
                :<NullDistPlot values={nullDist} diffObs={data.diffObs} alternative={alternative} showNormalCurve={showNormalCurve}/>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-1">
          {STEPS.map(({label,stages})=>{
            const active=(stages as AnimStage[]).includes(animStage)&&!isAnimating
            return (<button key={label} onClick={handleStep} disabled={!active}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${active?'bg-[var(--color-accent)] border-[var(--color-accent)] text-white shadow-sm scale-105':'border-[var(--color-border)] text-[var(--color-muted)] opacity-30 cursor-default'}`}>
              {label}
            </button>)
          })}
        </div>
        {isAnimating&&<span className="text-xs italic text-[var(--color-muted)]">Animating…</span>}
        <div className="w-px h-5 bg-[var(--color-border)] mx-1"/>
        {[1,10].map(n=>(<button key={n} onClick={()=>runAnimated(n)} disabled={isAnimating||isRunning} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Run {n.toLocaleString()}</button>))}
        {[100,1000].map(n=>(<button key={n} onClick={()=>runBatch(n)} disabled={isAnimating||isRunning} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Run {n.toLocaleString()}</button>))}
        <button onClick={handleReset} disabled={isAnimating||isRunning} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Reset</button>
      </div>
    </div>
  )
}
