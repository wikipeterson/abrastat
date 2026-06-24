'use client'

import { useEffect, useMemo, useState } from 'react'
import jStat from 'jstat'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { ProportionsCardConfig } from '@/lib/exploreTypes'

const jS = jStat as unknown as {
  normal: {
    pdf: (x: number, m: number, s: number) => number
    cdf: (x: number, m: number, s: number) => number
    inv: (p: number, m: number, s: number) => number
  }
}

type Alternative = 'less' | 'two-sided' | 'greater'
type ProcedureMode = 'test' | 'interval'
type SourceMode = 'data' | 'manual'
type ManualKind = 'one' | 'two'

interface PropSummary {
  n: number
  success: number
  phat: number
}

interface PropResult {
  stat: number
  p: number
  ci: [number, number]
}

function fmt(n: number, sig = 4): string {
  if (!isFinite(n)) return '—'
  return parseFloat(n.toPrecision(sig)).toLocaleString()
}

function fmtP(p: number): string {
  if (!isFinite(p)) return '—'
  if (p < 0.0001) return '< 0.0001'
  return p.toFixed(4)
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function clampCi(ci: [number, number]): [number, number] {
  return [clamp01(ci[0]), clamp01(ci[1])]
}

function calcP(stat: number, alt: Alternative): number {
  const cdf = jS.normal.cdf(stat, 0, 1)
  if (alt === 'less') return cdf
  if (alt === 'greater') return 1 - cdf
  return 2 * Math.min(cdf, 1 - cdf)
}

interface Props {
  cardId: string
  config: ProportionsCardConfig
  onClearZone: (zone: string) => void
  onAssignZone: (zone: 'var1' | 'var2', colId: string) => boolean
}

function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function ProportionsCard({ cardId, config, onClearZone, onAssignZone }: Props) {
  const { grid } = useStore()
  const accentColor = getCssVar('--color-accent', '#16A89B')
  const goldColor = getCssVar('--color-gold', '#E8920C')
  const goldTextColor = getCssVar('--color-gold-text', '#8A5800')

  function handleNativeDrop(zone: 'var1' | 'var2') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      onAssignZone(zone, colId)
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const responseCol = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const groupCol = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null
  const hasGroup = groupCol?.type === 'categorical'
  const [sourceMode, setSourceMode] = useState<SourceMode>('data')
  const [manualKind, setManualKind] = useState<ManualKind>('one')

  const responseLevels = useMemo(() => {
    if (!config.var1ColId) return []
    return [...new Set(grid.rows.map(r => String(r[config.var1ColId!] ?? '').trim()).filter(Boolean))].sort()
  }, [grid.rows, config.var1ColId])

  const groupLevels = useMemo(() => {
    if (!config.var2ColId || !hasGroup) return []
    return [...new Set(grid.rows.map(r => String(r[config.var2ColId!] ?? '').trim()).filter(Boolean))].sort()
  }, [grid.rows, config.var2ColId, hasGroup])

  const [successLevel, setSuccessLevel] = useState('')
  const [groupA, setGroupA] = useState('')
  const [groupB, setGroupB] = useState('')
  const [manualN1, setManualN1] = useState('100')
  const [manualX1, setManualX1] = useState('50')
  const [manualN2, setManualN2] = useState('100')
  const [manualX2, setManualX2] = useState('50')
  const [mode, setMode] = useState<ProcedureMode>('test')
  const [h0, setH0] = useState('0.5')
  const [alpha, setAlpha] = useState('0.05')
  const [confidenceLevel, setConfidenceLevel] = useState('95')
  const [alternative, setAlternative] = useState<Alternative>('two-sided')

  useEffect(() => {
    if (responseLevels.length > 0) {
      setSuccessLevel(current => (current && responseLevels.includes(current)) ? current : responseLevels[0])
    }
  }, [responseLevels])

  useEffect(() => {
    if (groupLevels.length >= 2) {
      setGroupA(current => (current && groupLevels.includes(current)) ? current : groupLevels[0])
      setGroupB(current => (current && groupLevels.includes(current) && current !== groupA) ? current : groupLevels[1])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupLevels.join(',')])

  const oneSampleSummary = useMemo<PropSummary | null>(() => {
    if (!config.var1ColId || !successLevel) return null
    const values = grid.rows.map(r => String(r[config.var1ColId!] ?? '').trim()).filter(Boolean)
    if (values.length === 0) return null
    const success = values.filter(v => v === successLevel).length
    return { n: values.length, success, phat: success / values.length }
  }, [grid.rows, config.var1ColId, successLevel])

  const groupedSummaries = useMemo(() => {
    if (!config.var1ColId || !config.var2ColId || !hasGroup || !successLevel) return { a: null as PropSummary | null, b: null as PropSummary | null }
    let nA = 0, xA = 0, nB = 0, xB = 0
    for (const row of grid.rows) {
      const response = String(row[config.var1ColId] ?? '').trim()
      const group = String(row[config.var2ColId] ?? '').trim()
      if (!response || !group) continue
      if (group === groupA) {
        nA += 1
        if (response === successLevel) xA += 1
      } else if (group === groupB) {
        nB += 1
        if (response === successLevel) xB += 1
      }
    }
    return {
      a: nA > 0 ? { n: nA, success: xA, phat: xA / nA } : null,
      b: nB > 0 ? { n: nB, success: xB, phat: xB / nB } : null,
    }
  }, [grid.rows, config.var1ColId, config.var2ColId, groupA, groupB, hasGroup, successLevel])

  const alphaVal = parseFloat(alpha)
  const h0Val = parseFloat(h0)
  const confidenceVal = parseFloat(confidenceLevel)
  const useManual = sourceMode === 'manual'
  const effectiveHasGroup = useManual ? manualKind === 'two' : hasGroup

  useEffect(() => {
    setH0(current => {
      const parsed = parseFloat(current)
      if (!isFinite(parsed)) return effectiveHasGroup ? '0' : '0.5'
      if (effectiveHasGroup && parsed === 0.5) return '0'
      if (!effectiveHasGroup && parsed === 0) return '0.5'
      return current
    })
  }, [effectiveHasGroup])

  const manualSummary1 = useMemo<PropSummary | null>(() => {
    if (!useManual) return null
    const n = parseInt(manualN1, 10)
    const success = parseInt(manualX1, 10)
    if (!isFinite(n) || !isFinite(success) || n <= 0 || success < 0 || success > n) return null
    return { n, success, phat: success / n }
  }, [manualN1, manualX1, useManual])

  const manualSummary2 = useMemo<PropSummary | null>(() => {
    if (!useManual || manualKind !== 'two') return null
    const n = parseInt(manualN2, 10)
    const success = parseInt(manualX2, 10)
    if (!isFinite(n) || !isFinite(success) || n <= 0 || success < 0 || success > n) return null
    return { n, success, phat: success / n }
  }, [manualKind, manualN2, manualX2, useManual])

  const result = useMemo<PropResult | null>(() => {
    if (!isFinite(alphaVal) || alphaVal <= 0 || alphaVal >= 1 || !isFinite(h0Val)) return null
    if (!isFinite(confidenceVal) || confidenceVal <= 0 || confidenceVal >= 100) return null
    const ciAlpha = 1 - confidenceVal / 100
    const zStar = jS.normal.inv(1 - ciAlpha / 2, 0, 1)

    if (effectiveHasGroup) {
      const a = useManual ? manualSummary1 : groupedSummaries.a
      const b = useManual ? manualSummary2 : groupedSummaries.b
      if (!a || !b) return null
      const pooled = (a.success + b.success) / (a.n + b.n)
      const seTest = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n))
      const seCi = Math.sqrt((a.phat * (1 - a.phat)) / a.n + (b.phat * (1 - b.phat)) / b.n)
      if (!isFinite(seTest) || seTest === 0 || !isFinite(seCi)) return null
      const diff = a.phat - b.phat
      const z = (diff - h0Val) / seTest
      const p = calcP(z, alternative)
      return { stat: z, p, ci: clampCi([diff - zStar * seCi, diff + zStar * seCi]) }
    }

    const s = useManual ? manualSummary1 : oneSampleSummary
    if (!s || h0Val <= 0 || h0Val >= 1) return null
    const seTest = Math.sqrt((h0Val * (1 - h0Val)) / s.n)
    const seCi = Math.sqrt((s.phat * (1 - s.phat)) / s.n)
    if (!isFinite(seTest) || seTest === 0 || !isFinite(seCi)) return null
    const z = (s.phat - h0Val) / seTest
    const p = calcP(z, alternative)
    return { stat: z, p, ci: clampCi([s.phat - zStar * seCi, s.phat + zStar * seCi]) }
  }, [alphaVal, confidenceVal, effectiveHasGroup, groupedSummaries.a, groupedSummaries.b, h0Val, manualSummary1, manualSummary2, oneSampleSummary, alternative, useManual])

  const chartTraces = useMemo(() => {
    if (!result) return null
    // Fixed, readable range. When |z| exceeds it we flag the statistic at the tail edge
    // with an arrow rather than zooming out until the bell curve collapses to a spike.
    const RANGE = 4.5
    const absMax = RANGE
    const off = Math.abs(result.stat) > RANGE
    const markerX = off ? Math.sign(result.stat) * RANGE : result.stat
    const nPts = 300
    const xs = Array.from({ length: nPts }, (_, i) => -absMax + (2 * absMax * i) / (nPts - 1))
    const ys = xs.map(x => jS.normal.pdf(x, 0, 1))
    const yMax = Math.max(...ys)
    function shadeTrace(fromX: number, toX: number) {
      const pts = xs.filter(x => x >= fromX && x <= toX)
      if (pts.length === 0) return null
      return {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [fromX, ...pts, toX],
        y: [0, ...pts.map(x => jS.normal.pdf(x, 0, 1)), 0],
        fill: 'tozeroy' as const,
        fillcolor: 'rgba(232,146,12,0.18)',
        line: { color: 'rgba(232,146,12,0.4)', width: 1 },
        hoverinfo: 'skip' as const,
        showlegend: false,
      }
    }
    const shades = []
    const absStat = Math.abs(result.stat)
    if (!off) {
      if (alternative === 'less') {
        const t = shadeTrace(-absMax, result.stat); if (t) shades.push(t)
      } else if (alternative === 'greater') {
        const t = shadeTrace(result.stat, absMax); if (t) shades.push(t)
      } else {
        const t1 = shadeTrace(-absMax, -absStat); if (t1) shades.push(t1)
        const t2 = shadeTrace(absStat, absMax); if (t2) shades.push(t2)
      }
    }
    return {
      traces: [
        ...shades,
        { type: 'scatter' as const, mode: 'lines' as const, x: xs, y: ys, line: { color: accentColor, width: 2 }, hoverinfo: 'skip' as const, showlegend: false },
        { type: 'scatter' as const, mode: 'lines' as const, x: [markerX, markerX], y: [0, Math.min(jS.normal.pdf(markerX, 0, 1) * 1.05, yMax)], line: { color: goldColor, width: 2, dash: 'dash' as const }, hoverinfo: 'skip' as const, showlegend: false },
      ],
      absMax,
      yMax,
      off,
      markerX,
    }
  }, [alternative, result, accentColor, goldColor])

  const rejected = result ? result.p < alphaVal : false
  const altSymbol = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const h0Label = effectiveHasGroup ? 'p₁ − p₂ =' : 'p ='
  const altLabel = effectiveHasGroup ? 'p₁ − p₂' : 'p'
  const altStatement = `${altLabel} ${altSymbol} ${h0}`
  const confidenceLevelNum = isFinite(confidenceVal) ? confidenceVal : 95
  const procedureLabel = effectiveHasGroup
    ? (mode === 'test' ? '2-proportion z-test' : '2-proportion z-interval')
    : (mode === 'test' ? '1-proportion z-test' : '1-proportion z-interval')

  // ── Setup panel (procedure toggle + H₀/Hₐ/α for tests, Confidence always). Pairs with
  //    the chart at matched height in test mode; goes full width for intervals. ──
  const setupPanel = (
    <div className="bg-[var(--color-bg)] rounded-xl p-3 flex flex-col gap-2.5 justify-center">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-muted)] w-20 flex-shrink-0">Procedure</span>
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
          {([
            ['test', procedureLabel.replace('interval', 'test')],
            ['interval', procedureLabel.replace('test', 'interval')],
          ] as [ProcedureMode, string][]).map(([nextMode, label], i) => (
            <button
              key={nextMode}
              onClick={() => setMode(nextMode)}
              className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${mode === nextMode ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        {mode === 'test' && (
          <>
            <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">H₀: {h0Label}</label>
            <div><input type="number" min={effectiveHasGroup ? -1 : 0} max={1} step={0.01} value={h0} onChange={e => setH0(e.target.value)} className="w-20 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" /></div>

            <span className="text-xs text-[var(--color-muted)]">Hₐ:</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-[var(--color-text)]">{altLabel}</span>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-sm font-mono">
                {(['less', 'two-sided', 'greater'] as Alternative[]).map((a, i) => (
                  <button key={a} onClick={() => setAlternative(a)} className={`px-2.5 py-1 font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${alternative === a ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}>
                    {a === 'less' ? '<' : a === 'two-sided' ? '≠' : '>'}
                  </button>
                ))}
              </div>
              <span className="text-sm font-mono font-medium text-[var(--color-muted)]">{h0}</span>
            </div>

            <label className="text-xs text-[var(--color-muted)]">α =</label>
            <div><input type="number" min={0.0001} max={0.9999} step={0.001} value={alpha} onChange={e => setAlpha(e.target.value)} className="w-24 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" /></div>
          </>
        )}

        <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">Confidence</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {[90, 95, 99].map((lvl, i) => (
              <button key={lvl} onClick={() => setConfidenceLevel(String(lvl))} className={`px-2.5 py-1 font-mono font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${confidenceVal === lvl ? 'bg-[var(--color-accent-strong)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}>
                {lvl}%
              </button>
            ))}
          </div>
          <div className={`flex items-center rounded-lg border bg-white px-2 ${![90, 95, 99].includes(confidenceVal) ? 'border-[var(--color-gold-ring)]' : 'border-[var(--color-border)]'}`}>
            <input type="number" min={50} max={99.9} step={0.1} value={confidenceLevel} onChange={e => setConfidenceLevel(e.target.value)} className="w-10 py-1 text-xs font-mono font-semibold text-right bg-transparent focus:outline-none" />
            <span className="text-xs font-mono font-semibold text-[var(--color-muted)]">%</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden text-sm">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-[var(--color-muted)]">Source</span>
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
          {([
            ['data', 'Use Data'],
            ['manual', 'Enter Info'],
          ] as [SourceMode, string][]).map(([nextMode, label], i) => (
            <button
              key={nextMode}
              onClick={() => setSourceMode(nextMode)}
              className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${sourceMode === nextMode ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {useManual && (
          <>
            <span className="ml-2 text-xs text-[var(--color-muted)]">Setup</span>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
              {([
                ['one', '1 proportion'],
                ['two', '2 proportions'],
              ] as [ManualKind, string][]).map(([nextKind, label], i) => (
                <button
                  key={nextKind}
                  onClick={() => setManualKind(nextKind)}
                  className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${manualKind === nextKind ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-bg)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!useManual && (
        <div className="flex gap-2 flex-shrink-0">
          <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
            <DropZone id={`${cardId}:var1`} label="Response Variable" hint="categorical only" assignedCol={responseCol} onClear={() => onClearZone('var1')} onAssign={colId => onAssignZone('var1', colId)} allowedTypes={['categorical']} />
          </div>
          <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
            <DropZone id={`${cardId}:var2`} label="2nd Variable or Group By" hint="categorical only" assignedCol={groupCol} onClear={() => onClearZone('var2')} onAssign={colId => onAssignZone('var2', colId)} allowedTypes={['categorical']} />
          </div>
        </div>
      )}

      {!useManual && !responseCol ? (
        <div className="flex-1 flex items-center justify-center text-center min-h-0">
          <div>
            <p className="text-3xl opacity-20 mb-2">p̂</p>
            <p className="text-xs text-[var(--color-muted)]">Drop a categorical response variable to begin</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
          {/* data-source pickers — full width */}
          {!useManual && responseLevels.length > 1 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">Success</span>
              <select value={successLevel} onChange={e => setSuccessLevel(e.target.value)} className="flex-1 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]">
                {responseLevels.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
          )}

          {!useManual && hasGroup && groupLevels.length > 2 && (
            <div className="flex gap-2 flex-shrink-0">
              {([['Compare', groupA, setGroupA, groupB], ['vs.', groupB, setGroupB, groupA]] as [string, string, (v: string) => void, string][]).map(
                ([label, value, setter, other]) => (
                  <div key={label} className="flex-1 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{label}</span>
                    <select value={value} onChange={e => setter(e.target.value)} className="flex-1 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]">
                      {groupLevels.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ),
              )}
            </div>
          )}

          {useManual && (
            <div className="bg-[var(--color-bg)] rounded-xl p-3 flex-shrink-0 space-y-2">
              <div className="grid gap-2 grid-cols-2">
                <label className="text-xs text-[var(--color-muted)]">
                  n₁
                  <input type="number" min={1} step={1} value={manualN1} onChange={e => setManualN1(e.target.value)} className="mt-1 w-full px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                </label>
                <label className="text-xs text-[var(--color-muted)]">
                  x₁
                  <input type="number" min={0} step={1} value={manualX1} onChange={e => setManualX1(e.target.value)} className="mt-1 w-full px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                </label>
              </div>
              {manualKind === 'two' && (
                <div className="grid gap-2 grid-cols-2">
                  <label className="text-xs text-[var(--color-muted)]">
                    n₂
                    <input type="number" min={1} step={1} value={manualN2} onChange={e => setManualN2(e.target.value)} className="mt-1 w-full px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                  </label>
                  <label className="text-xs text-[var(--color-muted)]">
                    x₂
                    <input type="number" min={0} step={1} value={manualX2} onChange={e => setManualX2(e.target.value)} className="mt-1 w-full px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* setup + chart at matched height; chart only for tests */}
          {mode === 'test' && chartTraces && result ? (
            <div className="grid md:grid-cols-2 gap-3 items-stretch flex-shrink-0">
              {setupPanel}
              <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-white flex items-center">
                <PlotlyChart
                  data={chartTraces.traces as never}
                  layout={{
                    xaxis: { range: [-chartTraces.absMax, chartTraces.absMax], title: { text: 'z', font: { size: 11 } }, zeroline: false, showgrid: false },
                    yaxis: { visible: false, range: [0, chartTraces.yMax * 1.12] },
                    margin: { t: 8, r: 8, b: 32, l: 8 },
                    height: 168,
                    showlegend: false,
                    annotations: chartTraces.off
                      ? [{ x: chartTraces.markerX, y: chartTraces.yMax * 0.5, ax: chartTraces.markerX > 0 ? -36 : 36, ay: 0, text: `z = ${fmt(result.stat, 3)}`, showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 2, arrowcolor: goldColor, font: { size: 11, color: goldTextColor }, xanchor: chartTraces.markerX > 0 ? 'right' : 'left' }]
                      : [{ x: result.stat, y: chartTraces.yMax * 1.08, text: `z = ${fmt(result.stat, 3)}`, showarrow: false, font: { size: 11, color: goldTextColor }, xanchor: result.stat >= 0 ? 'right' : 'left' }],
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0">{setupPanel}</div>
          )}

          {/* summary statistics — full width */}
          {((useManual && manualSummary1) || (!useManual && (oneSampleSummary || groupedSummaries.a))) && (
            <div className="flex-shrink-0">
              <p className="text-[10px] font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">Summary Statistics</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[var(--color-muted)] text-[10px]">
                    <th className="text-left font-semibold pb-1 pr-2">Group</th>
                    <th className="text-right font-semibold pb-1 px-2">n</th>
                    <th className="text-right font-semibold pb-1 px-2">x</th>
                    <th className="text-right font-semibold pb-1 pl-2">p̂</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {effectiveHasGroup ? (
                    useManual ? (
                      <>
                        {manualSummary1 && <PropSummaryRow label="Group 1" s={manualSummary1} />}
                        {manualSummary2 && <PropSummaryRow label="Group 2" s={manualSummary2} />}
                      </>
                    ) : (
                      <>
                        {groupedSummaries.a && <PropSummaryRow label={groupA || 'Group A'} s={groupedSummaries.a} />}
                        {groupedSummaries.b && <PropSummaryRow label={groupB || 'Group B'} s={groupedSummaries.b} />}
                      </>
                    )
                  ) : (
                    useManual
                      ? manualSummary1 && <PropSummaryRow label="Successes" s={manualSummary1} />
                      : oneSampleSummary && <PropSummaryRow label={successLevel || 'Success'} s={oneSampleSummary} />
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* results strip — full width (tests). Reject = gold (observed/extreme), fail = teal. */}
          {result && mode === 'test' && (
            <>
              <div className="grid gap-2 grid-cols-[1fr_1fr_1.6fr] flex-shrink-0">
                <StatBox label="z-statistic" value={fmt(result.stat, 4)} highlight="gold" />
                <StatBox label="p-value" value={fmtP(result.p)} />
                <StatBox label={`${confidenceLevelNum}% CI`} value={`(${fmt(result.ci[0])}, ${fmt(result.ci[1])})`} />
              </div>
              <div className={`rounded-xl p-3 border flex-shrink-0 ${rejected ? 'bg-[var(--color-gold-light)] border-[var(--color-gold-ring)]' : 'bg-[var(--color-accent-light)] border-[var(--color-border)]'}`}>
                <p className={`text-xs font-semibold mb-1 ${rejected ? 'text-[var(--color-gold-text)]' : 'text-[var(--color-accent-strong)]'}`}>{rejected ? 'Reject H₀' : 'Fail to Reject H₀'}</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                  {rejected
                    ? `At α = ${alpha}, there is sufficient evidence to conclude ${altStatement}.`
                    : `At α = ${alpha}, there is not sufficient evidence to conclude ${altStatement}.`}
                </p>
              </div>
            </>
          )}

          {/* CI only — full width (intervals) */}
          {result && mode === 'interval' && (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex-shrink-0">
              <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide mb-1">{confidenceLevelNum}% Confidence Interval</p>
              <p className="text-sm font-mono font-semibold text-[var(--color-text)] mb-1.5">({fmt(result.ci[0])}, {fmt(result.ci[1])})</p>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                We are {confidenceLevelNum}% confident that {effectiveHasGroup ? 'the true difference in proportions' : 'the true population proportion'} lies between {fmt(result.ci[0])} and {fmt(result.ci[1])}.
              </p>
            </div>
          )}

          {!result && (
            <p className="text-xs text-[var(--color-muted)] italic flex-shrink-0">
              {useManual
                ? 'Enter valid counts to compute results.'
                : !successLevel
                  ? 'Choose a success level.'
                  : hasGroup && (!groupA || !groupB)
                    ? 'Assign a grouping variable with at least 2 distinct values.'
                    : hasGroup && (!groupedSummaries.a || !groupedSummaries.b)
                      ? 'Need data in both groups.'
                      : 'Need non-empty categorical data to compute results.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PropSummaryRow({ label, s }: { label: string; s: PropSummary }) {
  return (
    <tr>
      <td className="py-1.5 pr-2">{label}</td>
      <td className="py-1.5 px-2 text-right">{s.n}</td>
      <td className="py-1.5 px-2 text-right">{s.success}</td>
      <td className="py-1.5 pl-2 text-right">{fmt(s.phat)}</td>
    </tr>
  )
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: 'gold' | 'keep' }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight === 'gold' ? 'bg-[var(--color-gold-light)]' : highlight === 'keep' ? 'bg-[var(--color-accent-light)]' : 'bg-[var(--color-bg)]'}`}>
      <p className="text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-base font-mono tabular-nums font-semibold ${highlight === 'gold' ? 'text-[var(--color-gold-text)]' : highlight === 'keep' ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-text)]'}`}>{value}</p>
    </div>
  )
}
