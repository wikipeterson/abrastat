// Live aggregation from raw response docs (lib/polls/storage.ts's listResponses) — computed
// client-side at Results-view render time rather than a separate counters/aggregation
// collection, since a poll is capped at 1,000 responses (see types.ts) and reading that whole
// set in one query is trivial.

import { PollQuestion, PollResponse } from './types'

export interface CategoricalTally {
  choice: string
  count: number
  pct: number
}

export function aggregateCategorical(question: PollQuestion, responses: PollResponse[]): CategoricalTally[] {
  const choices = question.choices ?? []
  const counts = new Map(choices.map(c => [c, 0]))
  let total = 0
  for (const r of responses) {
    const value = r.answers[question.id]
    if (typeof value === 'string' && counts.has(value)) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
      total++
    }
  }
  return choices.map(choice => {
    const count = counts.get(choice) ?? 0
    return { choice, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
  })
}

export interface NumericBucket {
  start: number
  end: number
  count: number
}

export interface NumericSummary {
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  buckets: NumericBucket[]
}

const MAX_DOTPLOT_BUCKETS = 60

export function aggregateNumeric(question: PollQuestion, responses: PollResponse[]): NumericSummary {
  const values = responses
    .map(r => r.answers[question.id])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b)

  if (values.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null, buckets: [] }
  }

  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / values.length
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]
  const min = values[0]
  const max = values[values.length - 1]

  // One dotplot column per integer value, same as the design's fixed 0–20 mock — generalized to
  // the actual response range instead of hardcoded, and widened into multi-value bins past
  // MAX_DOTPLOT_BUCKETS columns so a poll with a huge numeric range (someone typed a stray
  // outlier, or the question's real range is just wide) never renders an unbounded number of
  // columns.
  const lo = Math.floor(min)
  const hi = Math.ceil(max)
  const range = hi - lo
  const binWidth = range > MAX_DOTPLOT_BUCKETS ? Math.ceil((range + 1) / MAX_DOTPLOT_BUCKETS) : 1
  const counts = new Map<number, number>()
  for (const v of values) {
    const rounded = Math.round(v)
    const binStart = lo + Math.floor((rounded - lo) / binWidth) * binWidth
    counts.set(binStart, (counts.get(binStart) ?? 0) + 1)
  }
  const buckets: NumericBucket[] = []
  for (let start = lo; start <= hi; start += binWidth) {
    buckets.push({ start, end: Math.min(start + binWidth - 1, hi), count: counts.get(start) ?? 0 })
  }

  return { count: values.length, mean, median, min, max, buckets }
}
