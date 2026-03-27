// Seeded random data generation for statistics games

function randNormal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function generateCorrelatedPairs(
  n: number,
  r: number
): { x: number[]; y: number[] } {
  const x = Array.from({ length: n }, randNormal)
  const y = x.map(xi => r * xi + Math.sqrt(Math.max(0, 1 - r * r)) * randNormal())
  return { x, y }
}

export function generateNormal(n: number, mean: number, stdDev: number): number[] {
  return Array.from({ length: n }, () => mean + stdDev * randNormal())
}

// Right-skewed via exponential transform, left-skewed via reflection
export function generateSkewed(n: number, direction: 'right' | 'left'): number[] {
  const base = Array.from({ length: n }, () => Math.exp(randNormal() * 0.7 + 0.5))
  if (direction === 'left') {
    const max = Math.max(...base)
    return base.map(v => max - v + Math.min(...base))
  }
  return base
}

export function pickUnique<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0])
  }
  return result
}

export const CORRELATION_POOL = [-0.95, -0.8, -0.65, -0.45, -0.2, 0.2, 0.45, 0.65, 0.8, 0.95]
export const ROUNDS_PER_GAME = 5

// Score for GuessCorrelation: 100 pts at perfect, 0 pts at |error| >= 0.5
export function correlationScore(guess: number, actual: number): number {
  return Math.round(Math.max(0, 100 - Math.abs(guess - actual) * 200))
}

// Linear regression helper used in GuessResidual
export function linearFit(
  x: number[],
  y: number[]
): { slope: number; intercept: number; residuals: number[] } {
  const n = x.length
  const xMean = x.reduce((a, b) => a + b, 0) / n
  const yMean = y.reduce((a, b) => a + b, 0) / n
  const slope =
    x.reduce((s, xi, i) => s + (xi - xMean) * (y[i] - yMean), 0) /
    x.reduce((s, xi) => s + (xi - xMean) ** 2, 0)
  const intercept = yMean - slope * xMean
  const residuals = x.map((xi, i) => y[i] - (slope * xi + intercept))
  return { slope, intercept, residuals }
}

// Generate a real-looking paired dataset using a named scenario
const REAL_SCENARIOS = [
  { label: 'Study hours vs test score', r: 0.75 },
  { label: 'Temperature vs ice cream sales', r: 0.82 },
  { label: 'Height vs shoe size', r: 0.78 },
  { label: 'Exercise hours vs resting heart rate', r: -0.68 },
  { label: 'Screen time vs sleep quality', r: -0.61 },
  { label: 'Income vs commute time', r: -0.45 },
]

export function getRealOrRandomRound(): {
  x: number[]
  y: number[]
  isReal: boolean
  scenarioLabel: string
} {
  const isReal = Math.random() < 0.5
  if (isReal) {
    const scenario = REAL_SCENARIOS[Math.floor(Math.random() * REAL_SCENARIOS.length)]
    const { x, y } = generateCorrelatedPairs(40, scenario.r)
    return { x, y, isReal: true, scenarioLabel: scenario.label }
  } else {
    const { x, y } = generateCorrelatedPairs(40, (Math.random() - 0.5) * 0.3) // near-zero r
    return { x, y, isReal: false, scenarioLabel: '' }
  }
}
