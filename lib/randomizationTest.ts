// Shared engine for randomization-based hypothesis tests.
// Currently supports two-proportion; designed to extend to two-mean, correlation, etc.

export type Alternative = 'greater' | 'less' | 'two'

export interface TwoProportionCase {
  id: number
  group: 0 | 1    // 0 = group 1 (left), 1 = group 2 (right)
  response: 0 | 1 // 1 = success
}

export interface TwoProportionData {
  group1Label: string
  group2Label: string
  successLabel: string
  failureLabel: string
  cases: TwoProportionCase[]
  n1: number
  n2: number
  s1: number    // observed successes in group 1
  s2: number    // observed successes in group 2
  p1: number
  p2: number
  diffObs: number // p1 - p2
}

export interface TwoProportionResult {
  assignment: number[] // IDs assigned to group 1
  s1Sim: number
  s2Sim: number
  p1Sim: number
  p2Sim: number
  diffSim: number
}

// Fisher-Yates shuffle (returns new array)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * One randomization: shuffle pooled cases, assign first n1 to group 1,
 * rest to group 2. Preserves both group sizes and total successes exactly.
 */
export function runTwoProportionRandomization(
  data: TwoProportionData,
): TwoProportionResult {
  const shuffled = shuffle(data.cases)
  const g1Sim = shuffled.slice(0, data.n1)
  const g2Sim = shuffled.slice(data.n1)
  const s1Sim = g1Sim.filter(c => c.response === 1).length
  const s2Sim = g2Sim.filter(c => c.response === 1).length
  return {
    assignment: g1Sim.map(c => c.id),
    s1Sim,
    s2Sim,
    p1Sim: s1Sim / data.n1,
    p2Sim: s2Sim / data.n2,
    diffSim: s1Sim / data.n1 - s2Sim / data.n2,
  }
}

export function isExtremeResult(
  diffSim: number,
  diffObs: number,
  alt: Alternative,
): boolean {
  if (alt === 'greater') return diffSim >= diffObs
  if (alt === 'less')    return diffSim <= diffObs
  return Math.abs(diffSim) >= Math.abs(diffObs)
}

// ── Two-mean randomization ────────────────────────────────────────────────────

export interface TwoMeanCase {
  id: number
  group: 0 | 1
  value: number
}

export interface TwoMeanData {
  group1Label: string
  group2Label: string
  cases: TwoMeanCase[]
  n1: number
  n2: number
  mean1: number
  mean2: number
  diffObs: number   // mean1 - mean2
}

export interface TwoMeanResult {
  assignment: number[]  // case IDs assigned to group 1
  mean1Sim: number
  mean2Sim: number
  diffSim: number
}

export function buildTwoMeanData(
  values1: number[],
  values2: number[],
  group1Label: string,
  group2Label: string,
): TwoMeanData {
  const cases: TwoMeanCase[] = []
  let id = 0
  values1.forEach(v => cases.push({ id: id++, group: 0, value: v }))
  values2.forEach(v => cases.push({ id: id++, group: 1, value: v }))
  const n1 = values1.length, n2 = values2.length
  const mean1 = n1 > 0 ? values1.reduce((a, b) => a + b, 0) / n1 : 0
  const mean2 = n2 > 0 ? values2.reduce((a, b) => a + b, 0) / n2 : 0
  return { group1Label, group2Label, cases, n1, n2, mean1, mean2, diffObs: mean1 - mean2 }
}

export function runTwoMeanRandomization(data: TwoMeanData): TwoMeanResult {
  const shuffled = shuffle(data.cases)
  const g1Sim = shuffled.slice(0, data.n1)
  const g2Sim = shuffled.slice(data.n1)
  const mean1Sim = g1Sim.reduce((s, c) => s + c.value, 0) / data.n1
  const mean2Sim = g2Sim.reduce((s, c) => s + c.value, 0) / data.n2
  return { assignment: g1Sim.map(c => c.id), mean1Sim, mean2Sim, diffSim: mean1Sim - mean2Sim }
}

// ── One-proportion randomization (Bernoulli simulation) ──────────────────────

export interface OnePropResult {
  xSim: number   // simulated count of successes
  pSim: number   // xSim / n
}

/**
 * Draw n independent Bernoulli trials with success probability p0.
 * Used for one-proportion null randomization test.
 */
export function runOnePropRandomization(n: number, p0: number): OnePropResult {
  let xSim = 0
  for (let i = 0; i < n; i++) {
    if (Math.random() < p0) xSim++
  }
  return { xSim, pSim: xSim / n }
}

/**
 * Whether a simulated count is at least as extreme as the observed count,
 * relative to the null center np0.
 */
export function isExtremeOneProp(
  xSim: number,
  xObs: number,
  n: number,
  p0: number,
  alt: Alternative,
): boolean {
  if (alt === 'greater') return xSim >= xObs
  if (alt === 'less')    return xSim <= xObs
  // Two-sided: distance from null center np0
  return Math.abs(xSim - n * p0) >= Math.abs(xObs - n * p0)
}

/**
 * Build TwoProportionData from raw counts. Generates case objects with IDs.
 * Successes come first within each group (id order), then failures.
 */
export function buildTwoProportionData(
  n1: number, s1: number,
  n2: number, s2: number,
  group1Label: string,
  group2Label: string,
  successLabel: string,
  failureLabel: string,
): TwoProportionData {
  const cases: TwoProportionCase[] = []
  let id = 0
  for (let i = 0; i < s1; i++)       cases.push({ id: id++, group: 0, response: 1 })
  for (let i = 0; i < n1 - s1; i++)  cases.push({ id: id++, group: 0, response: 0 })
  for (let i = 0; i < s2; i++)       cases.push({ id: id++, group: 1, response: 1 })
  for (let i = 0; i < n2 - s2; i++)  cases.push({ id: id++, group: 1, response: 0 })
  return {
    group1Label, group2Label, successLabel, failureLabel,
    cases, n1, n2, s1, s2,
    p1: s1 / n1,
    p2: s2 / n2,
    diffObs: s1 / n1 - s2 / n2,
  }
}
