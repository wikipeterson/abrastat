'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { TwoMeanRandomizationCardConfig, TwoMeanSimCardConfig } from '@/lib/exploreTypes'
import {
  Alternative,
  TwoMeanData,
  TwoMeanResult,
  buildTwoMeanData,
  isExtremeResult,
  runTwoMeanRandomization,
} from '@/lib/randomizationTest'

// ── Stage type ────────────────────────────────────────────────────────────────

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
const POOL_DUR        = 480
const SHUFFLE_DUR     = 180
const DEAL_DUR        = 260
const NUM_SH_PHASES   = 6

const COL_CX = {
  left:   CANVAS_W * 0.28,
  center: CANVAS_W * 0.5,
  right:  CANVAS_W * 0.72,
}

// ── Layout helpers ────────────────────────────────────────────────────────────

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

// ── Position map ──────────────────────────────────────────────────────────────

function computePositions(
  data: TwoMeanData,
  stage: Stage,
  assignment: number[],
  shufflePhase: number,
  pileCY: number,
): Map<number, CardPos> {
  const { cases, n1 } = data
  const n      = cases.length
  const layout = getCardLayout(n)
  const pos    = new Map<number, CardPos>()

  if (stage === 'observed') {
    const g1 = cases.filter(c => c.group === 0)
    const g2 = cases.filter(c => c.group === 1)
    g1.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, g1.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    g2.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, g2.length); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
    return pos
  }

  if (stage === 'pooling' || stage === 'pooled') {
    cases.forEach(c => {
      const {x,y,rotation} = pilePos(c.id, layout, pileCY)
      pos.set(c.id, {x,y,rotation,delay:0,faceDown:true})
    })
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
    cases.forEach(c => {
      const {x,y,rotation} = shufflePhasePos(c.id, NUM_SH_PHASES, layout, pileCY)
      pos.set(c.id, {x,y,rotation,delay:0,faceDown:true})
    })
    return pos
  }

  if (stage === 'reassigning') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id))
    const g2Sim = cases.filter(c => !aSet.has(c.id))
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

  if (stage === 'reassigned') {
    const aSet  = new Set(assignment)
    const g1Sim = cases.filter(c =>  aSet.has(c.id))
    const g2Sim = cases.filter(c => !aSet.has(c.id))
    g1Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    g2Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:true}) })
    return pos
  }

  // computing / plotting / done: face-up
  const aSet  = new Set(assignment)
  const g1Sim = cases.filter(c =>  aSet.has(c.id))
  const g2Sim = cases.filter(c => !aSet.has(c.id))
  g1Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.left,  layout, n1);     pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  g2Sim.forEach((c,i) => { const {x,y} = getSlotXY(i, COL_CX.right, layout, n - n1); pos.set(c.id, {x,y,rotation:0,delay:0,faceDown:false}) })
  return pos
}

// ── Null distribution plot (dynamic x-axis) ───────────────────────────────────

function formatTick(v: number, range: number): string {
  if (range >= 100) return v.toFixed(0)
  if (range >= 10)  return v.toFixed(1)
  if (range >= 1)   return v.toFixed(2)
  return v.toFixed(3)
}

function MeanNullDistPlot({ values, diffObs, alternative, showNormalCurve = false }: {
  values: number[]; diffObs: number; alternative: Alternative; showNormalCurve?: boolean
}) {
  const clipId = useId()
  const SVG_W = 760
  const MG = { t: 14, r: 16, b: 30, l: 16 }
  const plotHeight = 320
  const SVG_H = plotHeight + MG.t + MG.b
  const PW = SVG_W - MG.l - MG.r, PH = SVG_H - MG.t - MG.b

  // Dynamic x-axis range — include diffObs even if no sims yet
  const allPoints = values.length > 0 ? [...values, diffObs] : [diffObs - 1, diffObs, diffObs + 1]
  const rawMin = Math.min(...allPoints)
  const rawMax = Math.max(...allPoints)
  const rawRange = rawMax - rawMin
  const pad = Math.max(0.01, rawRange * 0.12)
  const xLo    = rawMin - pad
  const xHi    = rawMax + pad
  const xRange = xHi - xLo
  const xOf    = (v: number) => ((v - xLo) / xRange) * PW

  const targetBins = Math.max(28, Math.min(72, Math.round(PW / 12)))
  const bucket = Math.max(xRange / targetBins, 1e-6)
  const binOf = (v: number) => Math.round((v - xLo) / bucket)
  const binCenter = (bin: number) => xLo + bin * bucket

  const stackCounts = new Map<number, number>()
  values.forEach(v => {
    const bin = binOf(v)
    stackCounts.set(bin, (stackCounts.get(bin) ?? 0) + 1)
  })
  const maxStack = Math.max(1, ...Array.from(stackCounts.values()))

  const normalStats = (() => {
    if (!showNormalCurve || values.length < 2) return null
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
    const sd = Math.sqrt(variance)
    if (!Number.isFinite(sd) || sd <= 0) return null
    const samples = Array.from({ length: 241 }, (_, i) => {
      const x = xLo + (i / 240) * xRange
      const z = (x - mean) / sd
      const pdf = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI))
      return { x, expectedCount: values.length * pdf * bucket }
    })
    return { mean, sd, samples }
  })()

  const maxCurveCount = normalStats ? Math.max(...normalStats.samples.map(s => s.expectedCount)) : 0
  const topPad = 10
  const yMaxCount = Math.max(maxStack, maxCurveCount) * 1.12
  const yScale = (PH - topPad) / Math.max(1, yMaxCount)

  const seenC2 = new Map<number, number>()
  const dotStep = Math.min(6, yScale)
  const dotR = Math.max(0.55, Math.min(2.6, dotStep / 2 - 0.15))
  const circles = values.map(v => {
    const bin = binOf(v)
    const si = seenC2.get(bin) ?? 0
    seenC2.set(bin, si + 1)
    return { cx: xOf(binCenter(bin)), cy: PH - (si + 1) * dotStep + dotStep / 2, extreme: isExtremeResult(v, diffObs, alternative) }
  })

  const normalPath = (() => {
    if (!normalStats) return ''
    return normalStats.samples
      .map(s => `${xOf(s.x)},${Math.min(PH, Math.max(0, PH - s.expectedCount * yScale))}`)
      .join(' ')
  })()

  const obsX = xOf(diffObs)
  let shade = ''
  if (alternative === 'greater') {
    shade = `M${obsX},0 H${PW} V${PH} H${obsX} Z`
  } else if (alternative === 'less') {
    shade = `M0,0 H${obsX} V${PH} H0 Z`
  } else {
    const absD = Math.abs(diffObs)
    const xL = Math.max(0, xOf(-absD))
    const xR = Math.min(PW, xOf(absD))
    shade = `M0,0 H${xL} V${PH} H0 Z M${xR},0 H${PW} V${PH} H${xR} Z`
  }

  const ticks = Array.from({ length: 5 }, (_, i) => xLo + (i / 4) * xRange)

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
      <style>{`@keyframes dot-drop-full{from{transform:translateY(-${PH}px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={PW} height={PH}/></clipPath></defs>
      <g transform={`translate(${MG.l},${MG.t})`}>
        <path d={shade} fill="#0EA5A0" opacity={0.10}/>
        <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#E2E8F0" strokeWidth={1.5}/>
        {ticks.map((v, i) => (
          <g key={i} transform={`translate(${xOf(v)},${PH})`}>
            <line y2={3} stroke="#CBD5E1" strokeWidth={1}/>
            <text y={12} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="DM Sans,sans-serif">
              {formatTick(v, xRange)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {circles.map((c,i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={dotR} fill={c.extreme?'#0EA5A0':'#94A3B8'} opacity={0.85}
              style={i===circles.length-1&&values.length>0?{animation:'dot-drop-full 700ms ease-out'}:undefined}/>
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
        <text x={PW/2} y={PH+24} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily="DM Sans,sans-serif">Simulated x̄₁ − x̄₂</text>
      </g>
    </svg>
  )
}

function getTwoMeanNullSummary(data: TwoMeanData) {
  const N = data.cases.length
  if (N <= 1 || data.n1 <= 0 || data.n2 <= 0) return { mean: 0, sd: 0 }
  const grandMean = data.cases.reduce((s, c) => s + c.value, 0) / N
  const totalSS = data.cases.reduce((s, c) => s + (c.value - grandMean) ** 2, 0)
  const permVar = totalSS * (1 / data.n1 + 1 / data.n2) / (N - 1)
  return { mean: 0, sd: Math.sqrt(Math.max(0, permVar)) }
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
  computing:  'Simulated means revealed',
  plotting:   'Recording on null distribution…',
  done:       'Done',
}

function colMeanStats(cases: TwoMeanData['cases'], group: 0|1, assignment: number[]|null, stage: Stage) {
  const useObs = stage === 'observed' || stage === 'pooling'
  let members: typeof cases
  if (useObs) {
    members = cases.filter(c => c.group === group)
  } else if (assignment) {
    const s = new Set(assignment)
    members = group === 0 ? cases.filter(c => s.has(c.id)) : cases.filter(c => !s.has(c.id))
  } else {
    return { n: 0, mean: 0 }
  }
  const n = members.length
  const mean = n > 0 ? members.reduce((sum, c) => sum + c.value, 0) / n : 0
  return { n, mean }
}

function parseValues(text: string): { values: number[]; error: string | null } {
  const trimmed = text.trim()
  if (!trimmed) return { values: [], error: null }
  const tokens = trimmed.split(/[\s,\n]+/).filter(Boolean)
  const values: number[] = []
  for (const token of tokens) {
    const n = Number(token)
    if (!isFinite(n)) return { values: [], error: `Invalid value: "${token}"` }
    values.push(n)
  }
  return { values, error: null }
}

// ── Config card ───────────────────────────────────────────────────────────────

type SourceMode = 'data' | 'manual'
interface Props {
  cardId: string
  config: TwoMeanRandomizationCardConfig
  onClearZone: (z: string) => void
  onAssignZone: (zone: 'var1' | 'var2', colId: string) => boolean
}

export function TwoMeanRandomizationTest({ cardId, config, onClearZone, onAssignZone }: Props) {
  const { grid, updateExploreCard, addTwoMeanSimCard, exploreCards } = useStore()
  const dataShape = config.dataShape ?? 'grouping'

  const [sourceMode, setSourceMode]     = useState<SourceMode>('data')
  const [alternative, setAlternative]   = useState<Alternative>('two')
  const [nullDiff, setNullDiff]         = useState('0')
  const [groupA, setGroupA]             = useState('')
  const [groupB, setGroupB]             = useState('')
  const [manualLabel1, setManualLabel1] = useState('Group 1')
  const [manualLabel2, setManualLabel2] = useState('Group 2')
  const [manualValues1, setManualValues1] = useState('')
  const [manualValues2, setManualValues2] = useState('')

  const quantCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const secondCol = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null

  function handleNativeDrop(zone: 'var1' | 'var2') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return; e.preventDefault()
      onAssignZone(zone, colId)
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }

  const groupLevels = useMemo(() =>
    dataShape === 'grouping' && config.var2ColId
      ? [...new Set(grid.rows.map(r => String(r[config.var2ColId!] ?? '').trim()).filter(Boolean))].sort()
      : [],
    [dataShape, grid.rows, config.var2ColId])

  useEffect(() => {
    if (groupLevels.length >= 2) {
      setGroupA(c => (c && groupLevels.includes(c)) ? c : groupLevels[0])
      setGroupB(c => (c && groupLevels.includes(c) && c !== groupLevels[0]) ? c : groupLevels[1])
    }
  }, [groupLevels])

  const parsed1 = useMemo(() => parseValues(manualValues1), [manualValues1])
  const parsed2 = useMemo(() => parseValues(manualValues2), [manualValues2])

  const data = useMemo<TwoMeanData | null>(() => {
    if (sourceMode === 'manual') {
      if (parsed1.error || parsed2.error || parsed1.values.length === 0 || parsed2.values.length === 0) return null
      return buildTwoMeanData(parsed1.values, parsed2.values, manualLabel1.trim() || 'Group 1', manualLabel2.trim() || 'Group 2')
    }
    if (!config.var1ColId || !config.var2ColId) return null
    const values1: number[] = []
    const values2: number[] = []
    if (dataShape === 'two-quant') {
      const label1 = quantCol?.name ?? 'Variable 1'
      const label2 = secondCol?.name ?? 'Variable 2'
      for (const row of grid.rows) {
        const v1 = Number(row[config.var1ColId])
        const v2 = Number(row[config.var2ColId])
        if (isFinite(v1)) values1.push(v1)
        if (isFinite(v2)) values2.push(v2)
      }
      if (values1.length === 0 || values2.length === 0) return null
      return buildTwoMeanData(values1, values2, label1, label2)
    }
    if (!groupA || !groupB) return null
    for (const row of grid.rows) {
      const quant = Number(row[config.var1ColId])
      const grp = String(row[config.var2ColId] ?? '').trim()
      if (!isFinite(quant) || !grp) continue
      if (grp === groupA) values1.push(quant)
      else if (grp === groupB) values2.push(quant)
    }
    if (values1.length === 0 || values2.length === 0) return null
    return buildTwoMeanData(values1, values2, groupA, groupB)
  }, [config.var1ColId, config.var2ColId, dataShape, grid.rows, groupA, groupB, manualValues1, manualValues2, manualLabel1, manualLabel2, parsed1, parsed2, quantCol?.name, secondCol?.name, sourceMode])

  function handleLaunch() {
    if (!data) return
    const myCard = exploreCards.find(c => c.id === cardId)
    if (!myCard) return
    const existing = exploreCards.find(c =>
      c.config.type === 'two-mean-sim' &&
      c.config.label1 === data.group1Label &&
      c.config.values1.length === data.n1
    )
    if (existing) return
    addTwoMeanSimCard({
      values1: data.cases.filter(c => c.group === 0).map(c => c.value),
      values2: data.cases.filter(c => c.group === 1).map(c => c.value),
      label1: data.group1Label,
      label2: data.group2Label,
      alternative,
      nullDiff,
    }, myCard)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-4">
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

        {sourceMode === 'data' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted)]">Data shape</span>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                {([
                  { key: 'grouping', label: 'Quant + Group' },
                  { key: 'two-quant', label: 'Two Quant Variables' },
                ] as const).map((option, i) => (
                  <button
                    key={option.key}
                    onClick={() => {
                      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
                      if (!current || current.config.type !== 'two-mean-randomization') return
                      const nextVar2 =
                        option.key === 'grouping'
                          ? (secondCol?.type === 'categorical' ? current.config.var2ColId : null)
                          : (secondCol?.type === 'numeric' ? current.config.var2ColId : null)
                      updateExploreCard(cardId, {
                        config: {
                          ...current.config,
                          dataShape: option.key,
                          var2ColId: nextVar2,
                        },
                      })
                      setGroupA('')
                      setGroupB('')
                    }}
                    className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${dataShape === option.key ? 'bg-slate-700 text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
                <DropZone id={`${cardId}:var1`} label={dataShape === 'two-quant' ? 'Variable 1' : 'Quantitative Variable'} hint="numeric only" assignedCol={quantCol} onClear={() => onClearZone('var1')} onAssign={colId => onAssignZone('var1', colId)} allowedTypes={['numeric']} />
              </div>
              <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
                <DropZone id={`${cardId}:var2`} label={dataShape === 'two-quant' ? 'Variable 2' : 'Group By'} hint={dataShape === 'two-quant' ? 'numeric only' : 'categorical only'} assignedCol={secondCol} onClear={() => onClearZone('var2')} onAssign={colId => onAssignZone('var2', colId)} allowedTypes={dataShape === 'two-quant' ? ['numeric'] : ['categorical']} />
              </div>
            </div>
            {dataShape === 'grouping' && groupLevels.length > 2 && (
              <div className="flex gap-2">
                {(['Compare', 'vs.'] as const).map((lbl, idx) => {
                  const [val, setter, other] = idx === 0 ? [groupA, setGroupA, groupB] : [groupB, setGroupB, groupA]
                  return (
                    <div key={lbl} className="flex-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                      <select value={val} onChange={e => setter(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
                        {groupLevels.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
            {data && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-2 text-center text-sm">
                <span className="text-[var(--color-muted)]">x̄₁ − x̄₂ = {data.mean1.toFixed(3)} − {data.mean2.toFixed(3)} = </span>
                <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: manualLabel1, setLabel: setManualLabel1, values: manualValues1, setValues: setManualValues1, parsed: parsed1, placeholder: '3.1, 4.5, 2.8…' },
              { label: manualLabel2, setLabel: setManualLabel2, values: manualValues2, setValues: setManualValues2, parsed: parsed2, placeholder: '5.2, 6.1, 4.9…' },
            ] as const).map((side, idx) => (
              <div key={idx} className="space-y-1.5">
                <input value={side.label} onChange={e => side.setLabel(e.target.value)}
                  placeholder={`Group ${idx + 1}`}
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm bg-white text-[var(--color-text)]" />
                <textarea value={side.values} onChange={e => side.setValues(e.target.value)}
                  placeholder={side.placeholder}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-mono bg-white text-[var(--color-text)] resize-none" />
                <div className="text-[10px] text-[var(--color-muted)]">
                  {side.parsed.error
                    ? <span className="text-red-500">{side.parsed.error}</span>
                    : side.parsed.values.length > 0
                      ? `n = ${side.parsed.values.length},  x̄ = ${(side.parsed.values.reduce((a,b)=>a+b,0)/side.parsed.values.length).toFixed(3)}`
                      : 'Enter values separated by commas or spaces'}
                </div>
              </div>
            ))}
            {data && (
              <div className="col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-2 text-center text-sm">
                <span className="text-[var(--color-muted)]">x̄₁ − x̄₂ = {data.mean1.toFixed(3)} − {data.mean2.toFixed(3)} = </span>
                <span className="font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] tracking-wide">H₀: μ₁ − μ₂ =</span>
            <input type="number" step="any" value={nullDiff} onChange={e => setNullDiff(e.target.value)}
              className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-muted)] tracking-wide">Hₐ:</span>
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">μ₁ − μ₂</span>
            <select value={alternative} onChange={e => setAlternative(e.target.value as Alternative)}
              className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] bg-white">
              <option value="less">&lt;</option>
              <option value="greater">&gt;</option>
              <option value="two">≠</option>
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

function MeanColStatLabel({ cx, n, mean, highlight }: {
  cx: number; n: number; mean: number; highlight: boolean
}) {
  return (
    <div style={{position:'absolute',left:cx,top:5,transform:'translateX(-50%)',textAlign:'center',pointerEvents:'none'}}>
      <div className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-colors ${highlight?'bg-[var(--color-accent)] text-white':'bg-slate-100 text-[var(--color-muted)]'}`}>
        n={n}, x̄={mean.toFixed(3)}
      </div>
    </div>
  )
}

// ── TwoMeanSimCard ─────────────────────────────────────────────────────────────

export function TwoMeanSimCard({ cardId, config }: { cardId: string; config: TwoMeanSimCardConfig }) {
  const { updateExploreCard } = useStore()

  const data = useMemo(() =>
    buildTwoMeanData(config.values1, config.values2, config.label1, config.label2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.values1, config.values2, config.label1, config.label2])

  const [stage, setStage]                 = useState<Stage>('observed')
  const [shufflePhase, setShufflePhase]   = useState(0)
  const [assignment, setAssignment]       = useState<number[]>([])
  const [currentResult, setCurrentResult] = useState<TwoMeanResult | null>(null)
  const [highlightSim, setHighlightSim]   = useState(false)

  const nullDist     = config.nullDist
  const simCount     = config.simCount
  const extremeCount = config.extremeCount
  const alternative  = config.alternative
  const nullDiff     = config.nullDiff

  const cases     = data.cases
  const layout    = getCardLayout(cases.length)
  const canvasH   = getCanvasHeight(data.n1, data.n2)
  const pileCY    = HEADER_H + (canvasH - HEADER_H) / 2
  const isAnimating = ['pooling','shuffling','reassigning','plotting'].includes(stage)
  const pValue    = simCount > 0 ? extremeCount / simCount : null
  const positions = computePositions(data, stage, assignment, shufflePhase, pileCY)
  const cardTransDur = stage === 'shuffling' ? SHUFFLE_DUR : stage === 'reassigning' ? DEAL_DUR : POOL_DUR
  const showNormalCurve = config.showNormalCurve ?? false
  const nullSummary = useMemo(() => getTwoMeanNullSummary(data), [data])

  const dataRef   = useRef(data)
  const altRef    = useRef(alternative)
  const resultRef = useRef<TwoMeanResult | null>(null)
  useEffect(()=>{ dataRef.current = data },[data])
  useEffect(()=>{ altRef.current = alternative },[alternative])

  // ── Stage machine ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!['pooling','reassigning','plotting'].includes(stage)) return
    let id: ReturnType<typeof setTimeout>
    if (stage === 'pooling') {
      id = setTimeout(() => setStage('pooled'), POOL_DUR + 80)
    } else if (stage === 'reassigning') {
      const total = dealStaggerMax(dataRef.current.cases.length) + DEAL_DUR + 120
      id = setTimeout(() => setStage('reassigned'), total)
    } else if (stage === 'plotting') {
      id = setTimeout(() => {
        const result = resultRef.current
        if (result) {
          const newDist    = [...nullDist, result.diffSim]
          const newCount   = simCount + 1
          const newExtreme = extremeCount + (isExtremeResult(result.diffSim, dataRef.current.diffObs, altRef.current) ? 1 : 0)
          updateExploreCard(cardId, { config: { ...config, nullDist: newDist, simCount: newCount, extremeCount: newExtreme } })
        }
        setStage('done')
      }, 320)
    }
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // ── Shuffle phase machine ──────────────────────────────────────────────────
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
    if (isAnimating) return
    if (stage === 'observed' || stage === 'done')  { setStage('pooling') }
    else if (stage === 'pooled')   { setStage('shuffling'); setShufflePhase(1) }
    else if (stage === 'shuffled') {
      const result = runTwoMeanRandomization(data)
      resultRef.current = result; setAssignment(result.assignment); setCurrentResult(result); setStage('reassigning')
    }
    else if (stage === 'reassigned') { setHighlightSim(true); setStage('computing') }
    else if (stage === 'computing')  { setHighlightSim(false); setStage('plotting') }
  }

  function runBatch(count: number) {
    const diffs: number[] = []
    let newExtreme = 0
    let last: TwoMeanResult | null = null
    for (let i = 0; i < count; i++) {
      const r = runTwoMeanRandomization(data)
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
    setStage('observed'); setShufflePhase(0); setAssignment([]); setCurrentResult(null); setHighlightSim(false)
    updateExploreCard(cardId, { config: { ...config, nullDist: [], simCount: 0, extremeCount: 0 } })
  }

  const POOL_STAGES: Stage[] = ['pooling','pooled','shuffling','shuffled','reassigning']
  const showSplit    = !POOL_STAGES.includes(stage)
  const showCenter   = POOL_STAGES.includes(stage)
  const showFaceUp   = ['computing','plotting','done'].includes(stage)
  const showColStats = showSplit && showFaceUp

  const leftStats  = colMeanStats(cases, 0, showFaceUp ? assignment : null, stage)
  const rightStats = colMeanStats(cases, 1, showFaceUp ? assignment : null, stage)
  const altSymbol  = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const altStatement = `μ₁ − μ₂ ${altSymbol} ${nullDiff}`

  const aSet = useMemo(() => new Set(assignment), [assignment])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[680px_minmax(320px,1fr)]">
          {/* Animation canvas */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="overflow-x-auto flex justify-center">
              <div className="w-fit">
                <div className="relative bg-slate-50 border-b border-[var(--color-border)] flex-shrink-0" style={{width:CANVAS_W,height:HEADER_H}}>
                  <span style={{position:'absolute',left:COL_CX.left,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label1}</span>
                  {showCenter&&<span style={{position:'absolute',left:COL_CX.center,top:'50%',transform:'translate(-50%,-50%)',fontSize:11,color:'var(--color-muted)'}}>Pooled</span>}
                  <span style={{position:'absolute',left:COL_CX.right,top:showColStats?15:'50%',transform:showColStats?'translateX(-50%)':'translate(-50%,-50%)',fontSize:11,fontWeight:600,color:'var(--color-text)'}}>{config.label2}</span>
                  {showColStats && (
                    <>
                      <MeanColStatLabel cx={COL_CX.left}  n={leftStats.n}  mean={leftStats.mean}  highlight={highlightSim}/>
                      <MeanColStatLabel cx={COL_CX.right} n={rightStats.n} mean={rightStats.mean} highlight={highlightSim}/>
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
                    background:showSplit?'rgba(245,158,11,0.04)':'transparent',
                    borderLeft:showSplit?'1px dashed rgba(245,158,11,0.2)':'none',
                  }}/>
                  {cases.map(c => {
                    const p = positions.get(c.id) ?? {x:-50,y:-50,rotation:0,delay:0,faceDown:false}
                    const fd = p.faceDown
                    // face-up: teal for group 1, amber for group 2
                    const inG1 = assignment.length > 0 ? aSet.has(c.id) : c.group === 0
                    const bg  = fd ? '#1A8C80' : inG1 ? '#2EC4B6' : '#F59E0B'
                    const bdr = fd ? '#0D6B63' : inG1 ? '#1A8C80' : '#D97706'
                    return (
                      <div key={c.id} style={{
                        position:'absolute',left:p.x,top:p.y,width:layout.w,height:layout.h,
                        transition:`left ${cardTransDur}ms ease-in-out,top ${cardTransDur}ms ease-in-out,transform ${cardTransDur}ms ease-in-out,background-color 160ms,border-color 160ms`,
                        transitionDelay:`${p.delay}ms`,transform:`rotate(${p.rotation}deg)`,
                        borderRadius:Math.max(2,Math.floor(layout.w/7)),
                        backgroundColor:bg,border:`${Math.max(1,Math.floor(layout.w/14))}px solid ${bdr}`,
                        boxShadow:fd?'0 2px 5px rgba(0,0,0,0.20)':'0 1px 2px rgba(0,0,0,0.10)',boxSizing:'border-box',
                        display:'flex',alignItems:'center',justifyContent:'center',
                      }}>
                        {!fd && layout.w >= 18 && (
                          <span style={{
                            fontSize: Math.max(5, Math.min(9, layout.w * 0.28)),
                            color: inG1 ? 'rgba(10,70,60,0.85)' : 'rgba(120,60,0,0.85)',
                            fontFamily:'DM Sans,monospace',
                            fontWeight:600,
                            lineHeight:1,
                            overflow:'hidden',
                            maxWidth:layout.w-2,
                            textAlign:'center',
                          }}>
                            {Math.abs(c.value) >= 100
                              ? c.value.toFixed(0)
                              : Math.abs(c.value) >= 10
                                ? c.value.toFixed(1)
                                : c.value.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-slate-50 px-3 py-1.5" style={{width:CANVAS_W}}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      <span className="inline-block rounded-sm bg-[#2EC4B6] flex-shrink-0" style={{width:8,height:13,boxShadow:'0 1px 2px rgba(0,0,0,0.15)'}}/>
                      {config.label1}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                      <span className="inline-block rounded-sm bg-[#F59E0B] flex-shrink-0" style={{width:8,height:13,boxShadow:'0 1px 2px rgba(0,0,0,0.15)'}}/>
                      {config.label2}
                    </div>
                    <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">{CAPTIONS[stage]}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats + hypotheses */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
              <div className="grid text-xs" style={{gridTemplateColumns:'auto 1fr 1fr 1fr'}}>
                <div className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)]"/>
                {[config.label1, config.label2, 'x̄₁ − x̄₂'].map(h => (
                  <div key={h} className="px-2 py-1.5 bg-slate-50 border-b border-[var(--color-border)] text-center font-semibold text-[var(--color-muted)] truncate">{h}</div>
                ))}
                <div className="px-2 py-1.5 font-semibold text-[var(--color-muted)] bg-slate-50 text-[10px] flex items-center">Obs.</div>
                <div className="px-2 py-1.5 text-center text-[var(--color-text)]">n={data.n1}<br/><span className="font-bold">{data.mean1.toFixed(3)}</span></div>
                <div className="px-2 py-1.5 text-center text-[var(--color-text)]">n={data.n2}<br/><span className="font-bold">{data.mean2.toFixed(3)}</span></div>
                <div className="px-2 py-1.5 text-center font-bold text-[var(--color-accent)]">{data.diffObs.toFixed(3)}</div>
                {currentResult ? (
                  <>
                    <div className={`px-2 py-1.5 text-[10px] font-semibold flex items-center text-[var(--color-muted)] ${highlightSim?'bg-[var(--color-accent-light)]':''}`}>Sim.</div>
                    {[{n:data.n1,mean:currentResult.mean1Sim},{n:data.n2,mean:currentResult.mean2Sim}].map((cell,i) => (
                      <div key={i} className={`px-2 py-1.5 text-center text-[var(--color-text)] ${highlightSim?'bg-[var(--color-accent-light)]':''}`}>
                        n={cell.n}<br/><span className="font-bold">{cell.mean.toFixed(3)}</span>
                      </div>
                    ))}
                    <div className={`px-2 py-1.5 text-center ${highlightSim?'bg-[var(--color-accent-light)]':''}`}>
                      <span className={`font-bold ${isExtremeResult(currentResult.diffSim,data.diffObs,alternative)?'text-[var(--color-accent)]':'text-[var(--color-text)]'}`}>
                        {currentResult.diffSim.toFixed(3)}
                      </span>
                      {isExtremeResult(currentResult.diffSim,data.diffObs,alternative)&&<span className="text-[10px] text-[var(--color-accent)] ml-0.5">★</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1.5 text-[10px] text-[var(--color-muted)] opacity-30">Sim.</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-30">—</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-30">—</div>
                    <div className="px-2 py-1.5 text-center text-[var(--color-muted)] opacity-30">—</div>
                  </>
                )}
              </div>
              <div className="px-3 py-1 flex items-center justify-between border-t border-[var(--color-border)]">
                <span className="text-[10px] text-[var(--color-muted)]">Simulation #{simCount>0?simCount:'—'}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{simCount} total</span>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-xs text-[var(--color-muted)] space-y-1">
              <div><span className="font-semibold">H₀:</span> μ₁ − μ₂ = {nullDiff}</div>
              <div><span className="font-semibold">H₁:</span> {altStatement}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-3 text-xs text-[var(--color-muted)] grid grid-cols-3 gap-2">
              <span>n₁={data.n1}</span>
              <span>n₂={data.n2}</span>
              <span>N={cases.length}</span>
            </div>
          </div>
        </div>

        {/* Null distribution */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3 flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">Null Distribution</span>
            <div className="flex flex-col items-end gap-1">
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] select-none">
                <input
                  type="checkbox"
                  checked={showNormalCurve}
                  onChange={e => updateExploreCard(cardId, { config: { ...config, showNormalCurve: e.target.checked } })}
                  className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
                <span>Overlay normal curve</span>
              </label>
              <div className="text-[11px] text-[var(--color-muted)] text-right leading-tight">
                <div>Mean = {nullSummary.mean.toFixed(3)}</div>
                <div>SD = {nullSummary.sd.toFixed(3)}</div>
              </div>
            </div>
          </div>
          <div className="min-h-0" style={{height: simCount === 0 ? 180 : 180}}>
            {simCount === 0
              ? <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">Run simulations to build the null distribution</div>
              : <MeanNullDistPlot values={nullDist} diffObs={data.diffObs} alternative={alternative} showNormalCurve={showNormalCurve}/>
            }
          </div>
          <div className="flex items-center gap-3 pt-1.5 border-t border-[var(--color-border)] flex-shrink-0">
            <span className="text-xs text-[var(--color-muted)]">Extreme: <span className="font-bold text-[var(--color-text)]">{extremeCount}</span> / {simCount}</span>
            <span className="ml-auto text-sm font-bold text-[var(--color-accent)]">
              {pValue !== null ? `p ≈ ${pValue < 0.001 ? '< 0.001' : pValue.toFixed(4)}` : 'p = —'}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-slate-50">
        <div className="flex items-center gap-1">
          {STEPS.map(({label,stages})=>{
            const active = (stages as Stage[]).includes(stage) && !isAnimating
            return (
              <button key={label} onClick={handleStep} disabled={!active}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${
                  active ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white shadow-sm scale-105'
                          : 'border-[var(--color-border)] text-[var(--color-muted)] opacity-30 cursor-default'
                }`}>
                {label}
              </button>
            )
          })}
        </div>
        {isAnimating && <span className="text-xs italic text-[var(--color-muted)]">Animating…</span>}
        <div className="w-px h-5 bg-[var(--color-border)] mx-1"/>
        {[1,10,100,1000].map(n => (
          <button key={n} onClick={()=>runBatch(n)} disabled={isAnimating}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Run {n.toLocaleString()}
          </button>
        ))}
        <button onClick={handleReset} disabled={isAnimating}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Reset
        </button>
      </div>
    </div>
  )
}
