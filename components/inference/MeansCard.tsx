'use client'

import { useState, useMemo, useEffect } from 'react'
import jStat from 'jstat'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { MeansCardConfig } from '@/lib/exploreTypes'

const jS = jStat as unknown as {
  normal: { pdf: (x: number, m: number, s: number) => number; cdf: (x: number, m: number, s: number) => number; inv: (p: number, m: number, s: number) => number }
  studentt: { pdf: (x: number, df: number) => number; cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
}

type Procedure =
  | 'one-sample-t-test'
  | 'one-sample-t-interval'
  | 'one-sample-z-test'
  | 'one-sample-z-interval'
  | 'two-sample-t-test'
  | 'two-sample-t-interval'
  | 'paired-t-test'
  | 'paired-t-interval'

type Alternative = 'less' | 'two-sided' | 'greater'

interface SummaryStats { n: number; mean: number; sd: number; se: number }

interface TestResult {
  stat: number | null
  statLabel: string | null
  df: number | null
  p: number | null
  ci: [number, number]
  se: number
  diffN?: number
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

function summaryOf(values: number[]): SummaryStats | null {
  if (values.length < 2) return null
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  return { n, mean, sd, se: sd / Math.sqrt(n) }
}

function calcP(stat: number, df: number | null, alt: Alternative): number {
  const cdf = df !== null ? jS.studentt.cdf(stat, df) : jS.normal.cdf(stat, 0, 1)
  if (alt === 'less') return cdf
  if (alt === 'greater') return 1 - cdf
  return 2 * Math.min(cdf, 1 - cdf)
}

function isTestProcedure(procedure: Procedure) {
  return procedure.endsWith('-test')
}

function isZProcedure(procedure: Procedure) {
  return procedure.includes('-z-')
}

interface Props {
  cardId: string
  config: MeansCardConfig
  onClearZone: (zone: string) => void
  onAssignZone: (zone: 'var1' | 'var2', colId: string) => boolean
}

function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function MeansCard({ cardId, config, onClearZone, onAssignZone }: Props) {
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

  const var1Col = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const var2Col = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null
  const var2IsCategorical = var2Col?.type === 'categorical'
  const var2IsNumeric = var2Col?.type === 'numeric'
  const hasBoth = var1Col !== null && var2Col !== null

  const allGroups = useMemo(() => {
    if (!config.var2ColId || !var2IsCategorical) return []
    return [...new Set(grid.rows.map(r => String(r[config.var2ColId!] ?? '').trim()).filter(v => v))].sort()
  }, [grid.rows, config.var2ColId, var2IsCategorical])

  const [groupA, setGroupA] = useState('')
  const [groupB, setGroupB] = useState('')

  useEffect(() => {
    if (allGroups.length >= 2) {
      setGroupA(g => (g && allGroups.includes(g)) ? g : allGroups[0])
      setGroupB(g => (g && allGroups.includes(g) && g !== groupA) ? g : allGroups[1])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups.join(',')])

  const validProcedures: Procedure[] = (() => {
    if (!hasBoth) return ['one-sample-t-test', 'one-sample-t-interval', 'one-sample-z-test', 'one-sample-z-interval']
    if (var2IsCategorical) return ['two-sample-t-test', 'two-sample-t-interval']
    return ['two-sample-t-test', 'two-sample-t-interval', 'paired-t-test', 'paired-t-interval']
  })()

  const [procedure, setProcedure] = useState<Procedure>('one-sample-t-test')
  const effectiveProcedure = validProcedures.includes(procedure) ? procedure : validProcedures[0]

  const [h0, setH0] = useState('0')
  const [alternative, setAlternative] = useState<Alternative>('two-sided')
  const [alpha, setAlpha] = useState('0.05')
  const [sigma, setSigma] = useState('')
  // Confidence level for the reported interval — independent of α (the test's significance).
  const [confLevel, setConfLevel] = useState('95')

  const data1 = useMemo(() => {
    const id = config.var1ColId
    if (!id) return []
    return grid.rows
      .filter(r => r[id] !== '' && r[id] != null)
      .map(r => Number(r[id]))
      .filter(v => isFinite(v))
  }, [grid.rows, config.var1ColId])

  const data2 = useMemo(() => {
    const id = config.var2ColId
    if (!id || !var2IsNumeric) return []
    return grid.rows
      .filter(r => r[id] !== '' && r[id] != null)
      .map(r => Number(r[id]))
      .filter(v => isFinite(v))
  }, [grid.rows, config.var2ColId, var2IsNumeric])

  const { dataA, dataB } = useMemo(() => {
    if (!config.var1ColId || !config.var2ColId || !var2IsCategorical) return { dataA: [] as number[], dataB: [] as number[] }
    const a: number[] = []
    const b: number[] = []
    for (const row of grid.rows) {
      const group = String(row[config.var2ColId] ?? '').trim()
      const rawVal = row[config.var1ColId]
      if (rawVal === '' || rawVal == null) continue
      const val = Number(rawVal)
      if (!isFinite(val)) continue
      if (group === groupA) a.push(val)
      else if (group === groupB) b.push(val)
    }
    return { dataA: a, dataB: b }
  }, [grid.rows, config.var1ColId, config.var2ColId, var2IsCategorical, groupA, groupB])

  const stats1 = useMemo(() => summaryOf(data1), [data1])
  const stats2 = useMemo(() => summaryOf(data2), [data2])
  const statsA = useMemo(() => summaryOf(dataA), [dataA])
  const statsB = useMemo(() => summaryOf(dataB), [dataB])

  const result = useMemo((): TestResult | null => {
    const alphaVal = parseFloat(alpha)
    if (!isFinite(alphaVal) || alphaVal <= 0 || alphaVal >= 1) return null
    const h0Val = parseFloat(h0)
    if (isTestProcedure(effectiveProcedure) && !isFinite(h0Val)) return null
    // CI half-percentile from the confidence level (not α): 1 - (1-conf)/2 = (1+conf)/2
    const confVal = parseFloat(confLevel)
    const ciHalf = isFinite(confVal) && confVal > 0 && confVal < 100 ? (1 + confVal / 100) / 2 : 0.975

    if (var2IsCategorical && statsA && statsB) {
      const { n: n1, mean: m1, sd: s1 } = statsA
      const { n: n2, mean: m2, sd: s2 } = statsB
      const se = Math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2)
      if (!isFinite(se) || se === 0) return null
      const num = (s1 ** 2 / n1 + s2 ** 2 / n2) ** 2
      const den = (s1 ** 2 / n1) ** 2 / (n1 - 1) + (s2 ** 2 / n2) ** 2 / (n2 - 1)
      const df = num / den
      const tStar = jS.studentt.inv(ciHalf, df)
      const diff = m1 - m2
      if (effectiveProcedure === 'two-sample-t-test') {
        const t = (diff - h0Val) / se
        const p = calcP(t, df, alternative)
        return { stat: t, statLabel: 't', df, p, ci: [diff - tStar * se, diff + tStar * se], se }
      }
      return { stat: null, statLabel: null, df, p: null, ci: [diff - tStar * se, diff + tStar * se], se }
    }

    if (effectiveProcedure === 'one-sample-t-test' || effectiveProcedure === 'one-sample-t-interval') {
      if (!stats1) return null
      const { n, mean, se } = stats1
      const df = n - 1
      const tStar = jS.studentt.inv(ciHalf, df)
      if (effectiveProcedure === 'one-sample-t-test') {
        const t = (mean - h0Val) / se
        const p = calcP(t, df, alternative)
        return { stat: t, statLabel: 't', df, p, ci: [mean - tStar * se, mean + tStar * se], se }
      }
      return { stat: null, statLabel: null, df, p: null, ci: [mean - tStar * se, mean + tStar * se], se }
    }

    if (effectiveProcedure === 'one-sample-z-test' || effectiveProcedure === 'one-sample-z-interval') {
      const sigmaVal = parseFloat(sigma)
      if (!stats1 || !isFinite(sigmaVal) || sigmaVal <= 0) return null
      const { n, mean } = stats1
      const se = sigmaVal / Math.sqrt(n)
      const zStar = jS.normal.inv(ciHalf, 0, 1)
      if (effectiveProcedure === 'one-sample-z-test') {
        const z = (mean - h0Val) / se
        const p = calcP(z, null, alternative)
        return { stat: z, statLabel: 'z', df: null, p, ci: [mean - zStar * se, mean + zStar * se], se }
      }
      return { stat: null, statLabel: null, df: null, p: null, ci: [mean - zStar * se, mean + zStar * se], se }
    }

    if (effectiveProcedure === 'two-sample-t-test' || effectiveProcedure === 'two-sample-t-interval') {
      if (!stats1 || !stats2) return null
      const { n: n1, mean: m1, sd: s1 } = stats1
      const { n: n2, mean: m2, sd: s2 } = stats2
      const se = Math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2)
      if (!isFinite(se) || se === 0) return null
      const num = (s1 ** 2 / n1 + s2 ** 2 / n2) ** 2
      const den = (s1 ** 2 / n1) ** 2 / (n1 - 1) + (s2 ** 2 / n2) ** 2 / (n2 - 1)
      const df = num / den
      const tStar = jS.studentt.inv(ciHalf, df)
      const diff = m1 - m2
      if (effectiveProcedure === 'two-sample-t-test') {
        const t = (diff - h0Val) / se
        const p = calcP(t, df, alternative)
        return { stat: t, statLabel: 't', df, p, ci: [diff - tStar * se, diff + tStar * se], se }
      }
      return { stat: null, statLabel: null, df, p: null, ci: [diff - tStar * se, diff + tStar * se], se }
    }

    if (effectiveProcedure === 'paired-t-test' || effectiveProcedure === 'paired-t-interval') {
      if (!config.var1ColId || !config.var2ColId) return null
      const diffs: number[] = []
      for (const row of grid.rows) {
        const r1 = row[config.var1ColId]
        const r2 = row[config.var2ColId]
        if (r1 === '' || r1 == null || r2 === '' || r2 == null) continue
        const v1 = Number(r1)
        const v2 = Number(r2)
        if (!isFinite(v1) || !isFinite(v2)) continue
        diffs.push(v1 - v2)
      }
      const ds = summaryOf(diffs)
      if (!ds) return null
      const { n, mean, se } = ds
      const df = n - 1
      const tStar = jS.studentt.inv(ciHalf, df)
      if (effectiveProcedure === 'paired-t-test') {
        const t = (mean - h0Val) / se
        const p = calcP(t, df, alternative)
        return { stat: t, statLabel: 't', df, p, ci: [mean - tStar * se, mean + tStar * se], se, diffN: n }
      }
      return { stat: null, statLabel: null, df, p: null, ci: [mean - tStar * se, mean + tStar * se], se, diffN: n }
    }

    return null
  }, [effectiveProcedure, var2IsCategorical, stats1, stats2, statsA, statsB, h0, alpha, alternative, sigma, confLevel, config.var1ColId, config.var2ColId, grid.rows])

  const chartTraces = useMemo(() => {
    if (!result || result.stat === null || result.statLabel === null) return null
    const { stat, df } = result
    // Fixed, readable range. When the statistic lands beyond it we flag it at the edge
    // instead of zooming out until the curve collapses to a spike.
    const RANGE = 4.5
    const absMax = RANGE
    const off = Math.abs(stat) > RANGE
    const markerX = off ? Math.sign(stat) * RANGE : stat
    const nPts = 300
    const xs = Array.from({ length: nPts }, (_, i) => -absMax + (2 * absMax) * i / (nPts - 1))
    const pdf = df !== null ? (x: number) => { try { return jS.studentt.pdf(x, df) } catch { return 0 } } : (x: number) => jS.normal.pdf(x, 0, 1)
    const ys = xs.map(pdf)
    const yMax = Math.max(...ys)
    function shadeTrace(fromX: number, toX: number) {
      const pts = xs.filter(x => x >= fromX && x <= toX)
      if (pts.length === 0) return null
      return {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [fromX, ...pts, toX],
        y: [0, ...pts.map(pdf), 0],
        fill: 'tozeroy' as const,
        fillcolor: 'rgba(232,146,12,0.18)',
        line: { color: 'rgba(232,146,12,0.4)', width: 1 },
        hoverinfo: 'skip' as const,
        showlegend: false,
      }
    }
    const shades = []
    const absStat = Math.abs(stat)
    if (!off) {
      if (alternative === 'less') {
        const t = shadeTrace(-absMax, stat); if (t) shades.push(t)
      } else if (alternative === 'greater') {
        const t = shadeTrace(stat, absMax); if (t) shades.push(t)
      } else {
        const t1 = shadeTrace(-absMax, -absStat); if (t1) shades.push(t1)
        const t2 = shadeTrace(absStat, absMax); if (t2) shades.push(t2)
      }
    }
    return {
      traces: [
        ...shades,
        { type: 'scatter' as const, mode: 'lines' as const, x: xs, y: ys, line: { color: accentColor, width: 2 }, hoverinfo: 'skip' as const, showlegend: false },
        { type: 'scatter' as const, mode: 'lines' as const, x: [markerX, markerX], y: [0, Math.min(pdf(markerX) * 1.05, yMax)], line: { color: goldColor, width: 2, dash: 'dash' as const }, hoverinfo: 'skip' as const, showlegend: false },
      ],
      absMax,
      yMax,
      off,
      markerX,
    }
  }, [result, alternative, accentColor, goldColor])

  const testResult = result && result.stat !== null && result.statLabel !== null ? result as TestResult & { stat: number; statLabel: string } : null
  const alphaVal = parseFloat(alpha)
  const rejected = result?.p != null ? result.p < alphaVal : false
  const label1 = var2IsCategorical ? (groupA || 'Group A') : (var1Col?.name ?? 'Variable')
  const label2 = var2IsCategorical ? (groupB || 'Group B') : (var2Col?.name ?? 'Variable 2')
  const isPairedProcedure = effectiveProcedure.startsWith('paired-t')
  const h0Label = isPairedProcedure ? 'μ_d =' : (hasBoth || var2IsCategorical) ? 'μ₁ − μ₂ =' : 'μ ='
  const altMu = isPairedProcedure ? 'μ_d' : (hasBoth || var2IsCategorical) ? 'μ₁ − μ₂' : 'μ'
  const altSymbol = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const confLevelNum = isFinite(parseFloat(confLevel)) ? parseFloat(confLevel) : 95
  const procLabels: Record<Procedure, string> = {
    'one-sample-t-test': '1-sample t-test',
    'one-sample-t-interval': '1-sample t-interval',
    'one-sample-z-test': '1-sample z-test',
    'one-sample-z-interval': '1-sample z-interval',
    'two-sample-t-test': '2-sample t-test',
    'two-sample-t-interval': '2-sample t-interval',
    'paired-t-test': 'Paired t-test',
    'paired-t-interval': 'Paired t-interval',
  }

  // ── Setup panel (left of the chart). Labels in a grid column so they align even when
  //    the H₀ parameter label is long (μ₁ − μ₂). α shows for tests only; Confidence always. ──
  const setupPanel = (
    <div className="bg-[var(--color-panel)] rounded-xl p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center content-center">
      {isZProcedure(effectiveProcedure) && (
        <>
          <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">σ (known)</label>
          <div><input type="number" value={sigma} onChange={e => setSigma(e.target.value)} placeholder="e.g. 10" className="w-28 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" /></div>
        </>
      )}
      {isTestProcedure(effectiveProcedure) && (
        <>
          <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">H₀: {h0Label}</label>
          <div><input type="number" value={h0} onChange={e => setH0(e.target.value)} className="w-20 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" /></div>
          <span className="text-xs text-[var(--color-muted)]">Hₐ:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-medium text-[var(--color-text)]">{altMu}</span>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-sm font-mono">
              {(['less', 'two-sided', 'greater'] as Alternative[]).map((a, i) => (
                <button key={a} onClick={() => setAlternative(a)} className={`px-2.5 py-1 font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${alternative === a ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-panel)]'}`}>
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
            <button key={lvl} onClick={() => setConfLevel(String(lvl))} className={`px-2.5 py-1 font-mono font-semibold transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${parseFloat(confLevel) === lvl ? 'bg-[var(--color-accent-strong)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-panel)]'}`}>
              {lvl}%
            </button>
          ))}
        </div>
        <div className={`flex items-center rounded-lg border bg-white px-2 ${![90, 95, 99].includes(parseFloat(confLevel)) ? 'border-[var(--color-gold-ring)]' : 'border-[var(--color-border)]'}`}>
          <input type="number" min={50} max={99.9} step={0.1} value={confLevel} onChange={e => setConfLevel(e.target.value)} className="w-10 py-1 text-xs font-mono font-semibold text-right bg-transparent focus:outline-none" />
          <span className="text-xs font-mono font-semibold text-[var(--color-muted)]">%</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden text-sm">
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var1')}>
          <DropZone id={`${cardId}:var1`} label="Variable" hint="numeric only" assignedCol={var1Col} onClear={() => onClearZone('var1')} onAssign={colId => onAssignZone('var1', colId)} allowedTypes={['numeric']} />
        </div>
        <div className="flex-1" onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('var2')}>
          <DropZone id={`${cardId}:var2`} label="2nd Variable or Group By" hint="numeric or categorical" assignedCol={var2Col} onClear={() => onClearZone('var2')} onAssign={colId => onAssignZone('var2', colId)} />
        </div>
      </div>

      {var2IsCategorical && allGroups.length > 2 && (
        <div className="flex gap-2 flex-shrink-0">
          {([['Compare', groupA, setGroupA, groupB], ['vs.', groupB, setGroupB, groupA]] as [string, string, (v: string) => void, string][]).map(
            ([lbl, val, setter, other]) => (
              <div key={lbl} className="flex-1 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-[var(--color-muted)] flex-shrink-0">{lbl}</span>
                <select value={val} onChange={e => setter(e.target.value)} className="flex-1 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]">
                  {allGroups.filter(g => g !== other).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )
          )}
        </div>
      )}

      <div className="flex gap-1 flex-shrink-0 flex-wrap">
        {validProcedures.map(p => (
          <button
            key={p}
            onClick={() => setProcedure(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              effectiveProcedure === p ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:bg-[var(--color-panel)]'
            }`}
          >
            {procLabels[p]}
          </button>
        ))}
      </div>

      {!var1Col ? (
        <div className="flex-1 flex items-center justify-center text-center min-h-0">
          <div>
            <p className="text-3xl opacity-20 mb-2">μ</p>
            <p className="text-xs text-[var(--color-muted)]">Drop a numeric variable to begin</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
          {/* setup + chart at matched height; chart only for tests */}
          {isTestProcedure(effectiveProcedure) && chartTraces && testResult ? (
            <div className="grid md:grid-cols-2 gap-3 items-stretch flex-shrink-0">
              {setupPanel}
              <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-white flex items-center">
                <PlotlyChart
                  data={chartTraces.traces as never}
                  layout={{
                    xaxis: { range: [-chartTraces.absMax, chartTraces.absMax], title: { text: testResult.statLabel === 'z' ? 'z' : `t (df = ${fmt(result?.df ?? 0, 3)})`, font: { size: 11 } }, zeroline: false, showgrid: false },
                    yaxis: { visible: false, range: [0, chartTraces.yMax * 1.12] },
                    margin: { t: 8, r: 8, b: 32, l: 8 },
                    height: 168,
                    showlegend: false,
                    annotations: chartTraces.off
                      ? [{ x: chartTraces.markerX, y: chartTraces.yMax * 0.5, ax: chartTraces.markerX > 0 ? -36 : 36, ay: 0, text: `${testResult.statLabel} = ${fmt(testResult.stat, 3)}`, showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 2, arrowcolor: goldColor, font: { size: 11, color: goldTextColor }, xanchor: chartTraces.markerX > 0 ? 'right' : 'left' }]
                      : [{ x: testResult.stat, y: chartTraces.yMax * 1.08, text: `${testResult.statLabel} = ${fmt(testResult.stat, 3)}`, showarrow: false, font: { size: 11, color: goldTextColor }, xanchor: testResult.stat >= 0 ? 'right' : 'left' }],
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0">{setupPanel}</div>
          )}

          {/* summary statistics — full width */}
          {(stats1 || statsA) && (
            <div className="flex-shrink-0">
              <p className="text-[10px] font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">Summary Statistics</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[var(--color-muted)] text-[10px]">
                    <th className="text-left font-semibold pb-1 pr-2">Variable</th>
                    <th className="text-right font-semibold pb-1 px-2">n</th>
                    <th className="text-right font-semibold pb-1 px-2">x̄</th>
                    <th className="text-right font-semibold pb-1 px-2">s</th>
                    <th className="text-right font-semibold pb-1 pl-2">SE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {var2IsCategorical ? (
                    <>
                      {statsA && <SummaryRow label={label1} s={statsA} />}
                      {statsB && <SummaryRow label={label2} s={statsB} />}
                    </>
                  ) : (
                    <>
                      {stats1 && var1Col && <SummaryRow label={var1Col.name} s={stats1} />}
                      {stats2 && var2Col && <SummaryRow label={var2Col.name} s={stats2} />}
                    </>
                  )}
                </tbody>
              </table>
              {isPairedProcedure && result?.diffN !== undefined && <p className="text-[10px] text-[var(--color-muted)] mt-1 italic">{result.diffN} matched pairs used</p>}
            </div>
          )}

          {/* results strip — full width (tests) */}
          {result && isTestProcedure(effectiveProcedure) && (
            <div className={`grid gap-2 flex-shrink-0 ${result.df !== null ? 'grid-cols-[1fr_0.7fr_1fr_1.6fr]' : 'grid-cols-[1fr_1fr_1.6fr]'}`}>
              <StatBox label={`${result.statLabel}-statistic`} value={fmt(result.stat ?? NaN, 4)} highlight="gold" />
              {result.df !== null && <StatBox label="df" value={fmt(result.df, 4)} />}
              <StatBox label="p-value" value={fmtP(result.p ?? NaN)} />
              <StatBox label={`${confLevelNum}% CI`} value={`(${fmt(result.ci[0])}, ${fmt(result.ci[1])})`} />
            </div>
          )}

          {/* CI only — full width (intervals) */}
          {result && !isTestProcedure(effectiveProcedure) && (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 flex-shrink-0">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{confLevelNum}% Confidence Interval</p>
              <p className="text-sm font-mono font-medium">({fmt(result.ci[0])}, {fmt(result.ci[1])})</p>
            </div>
          )}

          {/* conclusion — full width (tests). Reject = gold (observed/extreme), fail = teal (consistent w/ null). */}
          {result && isTestProcedure(effectiveProcedure) && (
            <div className={`rounded-xl p-3 border flex-shrink-0 ${rejected ? 'bg-[var(--color-gold-light)] border-[var(--color-gold-ring)]' : 'bg-[var(--color-accent-light)] border-[var(--color-border)]'}`}>
              <p className={`text-xs font-semibold mb-1 ${rejected ? 'text-[var(--color-gold-text)]' : 'text-[var(--color-accent-strong)]'}`}>{rejected ? 'Reject H₀' : 'Fail to Reject H₀'}</p>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                {rejected
                  ? `At α = ${alpha}, there is sufficient evidence to conclude ${altMu} ${altSymbol} ${h0}.`
                  : `At α = ${alpha}, there is not sufficient evidence to conclude ${altMu} ${altSymbol} ${h0}.`}
              </p>
            </div>
          )}

          {!result && (
            <p className="text-xs text-[var(--color-muted)] italic flex-shrink-0">
              {isZProcedure(effectiveProcedure) && (!sigma || !isFinite(parseFloat(sigma)) || parseFloat(sigma) <= 0)
                ? 'Enter the known population standard deviation (σ) above.'
                : var2IsCategorical && (!groupA || !groupB)
                  ? 'Assign a grouping variable with at least 2 distinct values.'
                  : 'Need n ≥ 2 to compute results.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, s }: { label: string; s: SummaryStats }) {
  return (
    <tr>
      <td className="py-1 pr-2 font-medium text-[var(--color-text)] truncate max-w-[100px]">{label}</td>
      <td className="py-1 px-2 text-right">{s.n}</td>
      <td className="py-1 px-2 text-right">{fmt(s.mean)}</td>
      <td className="py-1 px-2 text-right">{fmt(s.sd)}</td>
      <td className="py-1 pl-2 text-right">{fmt(s.se)}</td>
    </tr>
  )
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: 'gold' | 'keep' }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight === 'gold' ? 'bg-[var(--color-gold-light)]' : highlight === 'keep' ? 'bg-[var(--color-accent-light)]' : 'bg-[var(--color-panel)]'}`}>
      <p className="text-[10px] font-mono text-[var(--color-muted)] mb-0.5">{label}</p>
      <p className={`text-base font-semibold font-mono tabular-nums ${highlight === 'gold' ? 'text-[var(--color-gold-text)]' : highlight === 'keep' ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-text)]'}`}>{value}</p>
    </div>
  )
}
