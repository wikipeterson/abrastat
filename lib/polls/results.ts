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

/** One respondent's numeric answer, kept alongside the raw value so a dotplot dot can be traced
 *  back to the response it came from (see components/polls/PollResults.tsx's click-a-dot-to-
 *  correct flow) — everything else here only ever needed the aggregate count. */
export interface NumericEntry {
  userId: string
  value: number
  submittedAt: string
}

export interface NumericBucket {
  start: number
  end: number
  entries: NumericEntry[]
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

/** One dotplot column per integer value, same as the original design's fixed 0–20 mock —
 *  generalized to the actual response range instead of hardcoded, and widened into multi-value
 *  bins past MAX_DOTPLOT_BUCKETS columns so a poll with a huge numeric range (someone typed a
 *  stray outlier, or the question's real range is just wide) never renders an unbounded number
 *  of columns. The one shared bucketing pass both aggregateNumeric's summary and the dotplot's
 *  clickable dots are built from, so they never disagree with each other. */
export function bucketNumericResponses(question: PollQuestion, responses: PollResponse[]): NumericBucket[] {
  const entries = responses
    .map(r => ({ userId: r.userId, value: r.answers[question.id], submittedAt: r.submittedAt }))
    .filter((e): e is NumericEntry => typeof e.value === 'number' && Number.isFinite(e.value))
    .sort((a, b) => a.value - b.value)

  if (entries.length === 0) return []

  const lo = Math.floor(entries[0].value)
  const hi = Math.ceil(entries[entries.length - 1].value)
  const range = hi - lo
  const binWidth = range > MAX_DOTPLOT_BUCKETS ? Math.ceil((range + 1) / MAX_DOTPLOT_BUCKETS) : 1

  const grouped = new Map<number, NumericEntry[]>()
  for (const e of entries) {
    const rounded = Math.round(e.value)
    const binStart = lo + Math.floor((rounded - lo) / binWidth) * binWidth
    const list = grouped.get(binStart)
    if (list) list.push(e)
    else grouped.set(binStart, [e])
  }

  const buckets: NumericBucket[] = []
  for (let start = lo; start <= hi; start += binWidth) {
    buckets.push({ start, end: Math.min(start + binWidth - 1, hi), entries: grouped.get(start) ?? [] })
  }
  return buckets
}

export function aggregateNumeric(question: PollQuestion, responses: PollResponse[]): NumericSummary {
  const buckets = bucketNumericResponses(question, responses)
  const values = buckets.flatMap(b => b.entries.map(e => e.value)).sort((a, b) => a - b)

  if (values.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null, buckets: [] }
  }

  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / values.length
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]

  return {
    count: values.length,
    mean,
    median,
    min: values[0],
    max: values[values.length - 1],
    buckets,
  }
}
