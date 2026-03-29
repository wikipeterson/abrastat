'use client'

import { useState, useMemo } from 'react'
import jStat from 'jstat'
import { useStore } from '@/lib/store'
import { DropZone } from '@/components/explore/DropZone'
import { MeansCardConfig } from '@/lib/exploreTypes'

// ─── jStat type shim ──────────────────────────────────────────────────────────

const jS = jStat as unknown as {
  normal:   { cdf: (x: number, m: number, s: number) => number; inv: (p: number, m: number, s: number) => number }
  studentt: { cdf: (x: number, df: number) => number; inv: (p: number, df: number) => number }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Procedure  = 'one-sample-t' | 'one-sample-z' | 'two-sample-t' | 'paired-t'
type Alternative = 'less' | 'two-sided' | 'greater'

interface SummaryStats { n: number; mean: number; sd: number; se: number }

interface TestResult {
  stat: number
  statLabel: string
  df: number | null
  p: number
  ci: [number, number]
  se: number
  diffN?: number    // for paired-t: number of valid pairs
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, sig = 4): string {
  if (!isFinite(n)) return '—'
  return parseFloat(n.toPrecision(sig)).toLocaleString()
}

function fmtP(p: number): string {
  if (!isFinite(p)) return '—'
  if (p < 0.0001) return '< 0.0001'
  return p.toFixed(4)
}

function summaryStats(values: number[]): SummaryStats | null {
  if (values.length < 2) return null
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  const se = sd / Math.sqrt(n)
  return { n, mean, sd, se }
}

function calcPValue(stat: number, df: number | null, alt: Alternative): number {
  if (df !== null) {
    const cdf = jS.studentt.cdf(stat, df)
    if (alt === 'less')      return cdf
    if (alt === 'greater')   return 1 - cdf
    return 2 * Math.min(cdf, 1 - cdf)
  } else {
    const cdf = jS.normal.cdf(stat, 0, 1)
    if (alt === 'less')      return cdf
    if (alt === 'greater')   return 1 - cdf
    return 2 * Math.min(cdf, 1 - cdf)
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  cardId: string
  config: MeansCardConfig
  onClearZone: (zone: string) => void
}

export function MeansCard({ cardId, config, onClearZone }: Props) {
  const { grid } = useStore()

  const var1Col = config.var1ColId ? (grid.columns.find(c => c.id === config.var1ColId) ?? null) : null
  const var2Col = config.var2ColId ? (grid.columns.find(c => c.id === config.var2ColId) ?? null) : null

  const hasBoth = var1Col !== null && var2Col !== null

  const [procedure, setProcedure]     = useState<Procedure>('one-sample-t')
  const [h0, setH0]                   = useState('0')
  const [alternative, setAlternative] = useState<Alternative>('two-sided')
  const [alpha, setAlpha]             = useState('0.05')
  const [sigma, setSigma]             = useState('')   // known σ for one-sample z

  // Auto-switch to a valid procedure when variable count changes
  const validProcedures: Procedure[] = hasBoth
    ? ['two-sample-t', 'paired-t']
    : ['one-sample-t', 'one-sample-z']

  const effectiveProcedure: Procedure = validProcedures.includes(procedure)
    ? procedure
    : (hasBoth ? 'two-sample-t' : 'one-sample-t')

  // Extract numeric data
  const data1 = useMemo(() => {
    if (!config.var1ColId) return []
    return grid.rows.map(r => Number(r[config.var1ColId!])).filter(v => isFinite(v))
  }, [grid.rows, config.var1ColId])

  const data2 = useMemo(() => {
    if (!config.var2ColId) return []
    return grid.rows.map(r => Number(r[config.var2ColId!])).filter(v => isFinite(v))
  }, [grid.rows, config.var2ColId])

  const stats1 = useMemo(() => summaryStats(data1), [data1])
  const stats2 = useMemo(() => summaryStats(data2), [data2])

  // Compute test result
  const result = useMemo((): TestResult | null => {
    const h0Val    = parseFloat(h0)
    const alphaVal = parseFloat(alpha)
    if (!isFinite(h0Val) || !isFinite(alphaVal) || alphaVal <= 0 || alphaVal >= 1) return null

    if (effectiveProcedure === 'one-sample-t') {
      if (!stats1) return null
      const { n, mean, se } = stats1
      const df = n - 1
      const t  = (mean - h0Val) / se
      const p  = calcPValue(t, df, alternative)
      const tStar = jS.studentt.inv(1 - alphaVal / 2, df)
      return { stat: t, statLabel: 't', df, p, ci: [mean - tStar * se, mean + tStar * se], se }
    }

    if (effectiveProcedure === 'one-sample-z') {
      const sigmaVal = parseFloat(sigma)
      if (!stats1 || !isFinite(sigmaVal) || sigmaVal <= 0) return null
      const { n, mean } = stats1
      const se   = sigmaVal / Math.sqrt(n)
      const z    = (mean - h0Val) / se
      const p    = calcPValue(z, null, alternative)
      const zStar = jS.normal.inv(1 - alphaVal / 2, 0, 1)
      return { stat: z, statLabel: 'z', df: null, p, ci: [mean - zStar * se, mean + zStar * se], se }
    }

    if (effectiveProcedure === 'two-sample-t') {
      if (!stats1 || !stats2) return null
      const { n: n1, mean: m1, sd: s1 } = stats1
      const { n: n2, mean: m2, sd: s2 } = stats2
      const se  = Math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2)
      const t   = ((m1 - m2) - h0Val) / se
      const num = (s1 ** 2 / n1 + s2 ** 2 / n2) ** 2
      const den = (s1 ** 2 / n1) ** 2 / (n1 - 1) + (s2 ** 2 / n2) ** 2 / (n2 - 1)
      const df  = num / den
      const p   = calcPValue(t, df, alternative)
      const tStar = jS.studentt.inv(1 - alphaVal / 2, df)
      const diff  = m1 - m2
      return { stat: t, statLabel: 't', df, p, ci: [diff - tStar * se, diff + tStar * se], se }
    }

    if (effectiveProcedure === 'paired-t') {
      if (!config.var1ColId || !config.var2ColId) return null
      const diffs: number[] = []
      for (const row of grid.rows) {
        const v1 = Number(row[config.var1ColId])
        const v2 = Number(row[config.var2ColId])
        if (isFinite(v1) && isFinite(v2)) diffs.push(v1 - v2)
      }
      const diffStats = summaryStats(diffs)
      if (!diffStats) return null
      const { n, mean, se } = diffStats
      const df = n - 1
      const t  = (mean - h0Val) / se
      const p  = calcPValue(t, df, alternative)
      const tStar = jS.studentt.inv(1 - alphaVal / 2, df)
      return { stat: t, statLabel: 't', df, p, ci: [mean - tStar * se, mean + tStar * se], se, diffN: n }
    }

    return null
  }, [effectiveProcedure, stats1, stats2, h0, alpha, alternative, sigma, config.var1ColId, config.var2ColId, grid.rows])

  const alphaVal  = parseFloat(alpha)
  const rejected  = result ? result.p < alphaVal : false

  // ─── H₀ label ──────────────────────────────────────────────────────────────
  const h0Label = hasBoth
    ? 'μ₁ − μ₂ ='
    : effectiveProcedure === 'paired-t'
      ? 'μ_d ='
      : 'μ ='

  const altSymbol = alternative === 'less' ? '<' : alternative === 'greater' ? '>' : '≠'
  const h0Display = hasBoth
    ? `μ₁ − μ₂ ${altSymbol} ${h0}`
    : effectiveProcedure === 'paired-t'
      ? `μ_d ${altSymbol} ${h0}`
      : `μ ${altSymbol} ${h0}`

  const procLabels: Record<Procedure, string> = {
    'one-sample-t': '1-sample t',
    'one-sample-z': '1-sample z',
    'two-sample-t': '2-sample t',
    'paired-t':     'Paired t',
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto text-sm">

      {/* ── Drop zones ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1">
          <DropZone
            id={`${cardId}:var1`}
            label={hasBoth ? 'Variable 1' : 'Variable'}
            hint="numeric only"
            assignedCol={var1Col}
            onClear={() => onClearZone('var1')}
          />
        </div>
        <div className="flex-1">
          <DropZone
            id={`${cardId}:var2`}
            label="Variable 2"
            hint="optional — for 2-sample / paired"
            assignedCol={var2Col}
            onClear={() => onClearZone('var2')}
          />
        </div>
      </div>

      {/* ── Procedure selector ──────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-shrink-0 flex-wrap">
        {validProcedures.map(p => (
          <button
            key={p}
            onClick={() => setProcedure(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              effectiveProcedure === p
                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                : 'bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:bg-slate-50'
            }`}
          >
            {procLabels[p]}
          </button>
        ))}
      </div>

      {/* ── Setup ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-50 rounded-xl p-3 flex-shrink-0 space-y-2.5">
        {/* Known σ (z-test only) */}
        {effectiveProcedure === 'one-sample-z' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)] w-20 flex-shrink-0">
              σ (known)
            </label>
            <input
              type="number"
              value={sigma}
              onChange={e => setSigma(e.target.value)}
              placeholder="e.g. 10"
              className="flex-1 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
        )}

        {/* H₀ */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)] w-20 flex-shrink-0">
            H₀: {h0Label}
          </label>
          <input
            type="number"
            value={h0}
            onChange={e => setH0(e.target.value)}
            className="w-24 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>

        {/* Hₐ direction */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)] w-20 flex-shrink-0">Hₐ:</span>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {(['less', 'two-sided', 'greater'] as Alternative[]).map((a, i) => (
              <button
                key={a}
                onClick={() => setAlternative(a)}
                className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                  alternative === a
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {a === 'less' ? '< (left)' : a === 'two-sided' ? '≠ (two)' : '> (right)'}
              </button>
            ))}
          </div>
        </div>

        {/* α */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)] w-20 flex-shrink-0">α =</label>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
            {['0.01', '0.05', '0.10'].map((a, i) => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className={`px-2.5 py-1 font-medium transition-colors ${i > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
                  alpha === a
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary statistics ──────────────────────────────────────────────── */}
      {(stats1 || stats2) && (
        <div className="flex-shrink-0">
          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
            Summary Statistics
          </p>
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
              {stats1 && var1Col && (
                <tr>
                  <td className="py-1 pr-2 font-medium text-[var(--color-text)] truncate max-w-[100px]">{var1Col.name}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{stats1.n}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{fmt(stats1.mean)}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{fmt(stats1.sd)}</td>
                  <td className="py-1 pl-2 text-right text-[var(--color-text)]">{fmt(stats1.se)}</td>
                </tr>
              )}
              {stats2 && var2Col && (
                <tr>
                  <td className="py-1 pr-2 font-medium text-[var(--color-text)] truncate max-w-[100px]">{var2Col.name}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{stats2.n}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{fmt(stats2.mean)}</td>
                  <td className="py-1 px-2 text-right text-[var(--color-text)]">{fmt(stats2.sd)}</td>
                  <td className="py-1 pl-2 text-right text-[var(--color-text)]">{fmt(stats2.se)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {effectiveProcedure === 'paired-t' && result?.diffN !== undefined && (
            <p className="text-[10px] text-[var(--color-muted)] mt-1 italic">
              {result.diffN} matched pairs used
            </p>
          )}
        </div>
      )}

      {/* ── Test results ────────────────────────────────────────────────────── */}
      {!var1Col ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <p className="text-3xl opacity-20 mb-2">μ</p>
            <p className="text-xs text-[var(--color-muted)]">Drop a numeric variable to begin</p>
          </div>
        </div>
      ) : result ? (
        <div className="space-y-3 flex-shrink-0">
          {/* Hypotheses */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)] w-6">H₀</span>
              <span className="text-xs font-mono font-medium text-[var(--color-text)]">
                {h0Label} {h0}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)] w-6">Hₐ</span>
              <span className="text-xs font-mono font-medium text-[var(--color-text)]">
                {h0Display}
              </span>
            </div>
          </div>

          {/* Test statistic + df */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{result.statLabel}-statistic</p>
              <p className="text-lg font-semibold text-[var(--color-text)] font-mono">{fmt(result.stat, 4)}</p>
            </div>
            {result.df !== null && (
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">df</p>
                <p className="text-lg font-semibold text-[var(--color-text)] font-mono">{fmt(result.df, 4)}</p>
              </div>
            )}
            <div className={`rounded-xl p-3 text-center ${rejected ? 'bg-red-50' : 'bg-green-50'}`}>
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">p-value</p>
              <p className={`text-lg font-semibold font-mono ${rejected ? 'text-red-600' : 'text-green-700'}`}>
                {fmtP(result.p)}
              </p>
            </div>
          </div>

          {/* Confidence interval */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">
              {Math.round((1 - alphaVal) * 100)}% Confidence Interval
            </p>
            <p className="text-xs font-mono text-[var(--color-text)] font-medium">
              ({fmt(result.ci[0])}, {fmt(result.ci[1])})
            </p>
          </div>

          {/* Conclusion */}
          <div className={`rounded-xl p-3 border ${rejected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-xs font-semibold mb-1 ${rejected ? 'text-red-700' : 'text-green-700'}`}>
              {rejected ? 'Reject H₀' : 'Fail to Reject H₀'}
            </p>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              {rejected
                ? `At α = ${alpha}, there is sufficient evidence to conclude ${h0Display}.`
                : `At α = ${alpha}, there is not sufficient evidence to conclude ${h0Display}.`
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="text-xs text-[var(--color-muted)] italic px-1">
          {effectiveProcedure === 'one-sample-z' && (!sigma || !isFinite(parseFloat(sigma)) || parseFloat(sigma) <= 0)
            ? 'Enter the known population standard deviation (σ) above.'
            : effectiveProcedure === 'paired-t' && (!stats1 || !stats2)
              ? 'Drop two variables with matching row counts to run a paired t-test.'
              : 'Not enough data to compute results (need n ≥ 2).'
          }
        </div>
      )}
    </div>
  )
}
