import jStat from 'jstat'
import { FrequencyRow, SummaryResult } from '@/types'

export function computeSummary(values: number[], columnName: string): SummaryResult | null {
  const clean = values.filter(v => v != null && isFinite(v))
  if (clean.length === 0) return null
  const q1 = jStat.percentile(clean, 0.25)
  const q3 = jStat.percentile(clean, 0.75)
  const iqr = q3 - q1
  return {
    column: columnName,
    n: clean.length,
    mean: jStat.mean(clean),
    median: jStat.median(clean),
    stdDev: jStat.stdev(clean, true),
    variance: jStat.variance(clean, true),
    min: jStat.min(clean),
    max: jStat.max(clean),
    range: jStat.max(clean) - jStat.min(clean),
    q1,
    q3,
    iqr,
    outliers: clean.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
  }
}

export function getFrequencyTable(values: string[]): FrequencyRow[] {
  const counts: Record<string, number> = {}
  values.forEach(v => { counts[String(v)] = (counts[String(v)] || 0) + 1 })
  const total = values.length
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count, percent: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
}

export function twoWayTable(
  rowValues: string[],
  colValues: string[]
): { rowLabels: string[]; colLabels: string[]; counts: number[][] } {
  const rowLabels = [...new Set(rowValues)].filter(Boolean).sort()
  const colLabels = [...new Set(colValues)].filter(Boolean).sort()
  const counts = rowLabels.map(r =>
    colLabels.map(c => rowValues.filter((v, i) => v === r && colValues[i] === c).length)
  )
  return { rowLabels, colLabels, counts }
}

export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r: number } {
  const xMean = jStat.mean(xs)
  const yMean = jStat.mean(ys)
  const slope = xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0) /
                xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
  const intercept = yMean - slope * xMean
  const r = jStat.corrcoeff(xs, ys)
  return { slope, intercept, r }
}
