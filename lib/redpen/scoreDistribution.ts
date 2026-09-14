// Percent-score analog of lib/polls/results.ts's bucketNumericResponses/aggregateNumeric — same
// bucket-then-aggregate shape, simplified since a percent score is always a fixed 0-100 range
// (no need for that file's dynamic range/bin-width logic). Used by ResultsView.tsx's score
// distribution dotplot, styled the same way PollResults.tsx's NumericChart already is.

import { RedPenResult } from './types'

export interface ScoreEntry {
  studentId: string
  pct: number
}

export interface ScoreBucket {
  start: number
  end: number
  entries: ScoreEntry[]
}

export interface ScoreDistributionSummary {
  count: number
  mean: number | null
  median: number | null
  buckets: ScoreBucket[]
}

const BUCKET_WIDTH = 5

export function bucketScores(results: RedPenResult[]): ScoreBucket[] {
  const entries: ScoreEntry[] = results
    .filter(r => r.maxScore > 0)
    .map(r => ({ studentId: r.studentId, pct: Math.round((r.score / r.maxScore) * 100) }))

  const grouped = new Map<number, ScoreEntry[]>()
  for (const e of entries) {
    const clamped = Math.min(100, Math.max(0, e.pct))
    const start = Math.min(95, Math.floor(clamped / BUCKET_WIDTH) * BUCKET_WIDTH)
    const list = grouped.get(start)
    if (list) list.push(e)
    else grouped.set(start, [e])
  }

  const buckets: ScoreBucket[] = []
  for (let start = 0; start < 100; start += BUCKET_WIDTH) {
    buckets.push({ start, end: start + BUCKET_WIDTH - 1, entries: grouped.get(start) ?? [] })
  }
  return buckets
}

export function summarizeScores(results: RedPenResult[]): ScoreDistributionSummary {
  const buckets = bucketScores(results)
  const values = buckets.flatMap(b => b.entries.map(e => e.pct)).sort((a, b) => a - b)

  if (values.length === 0) {
    return { count: 0, mean: null, median: null, buckets }
  }

  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / values.length
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]

  return { count: values.length, mean, median, buckets }
}
