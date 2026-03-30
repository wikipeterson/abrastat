import type { ChartType } from './chartHelpers'

export interface GraphCardConfig {
  type: 'graph'
  xColId: string | null
  yColId: string | null
  groupColId: string | null
  chartType?: ChartType | null
}

export interface SummaryCardConfig {
  type: 'summary'
  variableColIds: string[]
  groupColId: string | null
}

export interface TableCardConfig {
  type: 'table'
  rowsColId: string | null
  colsColId: string | null
}

export interface RegressionCardConfig {
  type: 'regression'
  xColId: string | null
  yColId: string | null
}

// ─── Distribution pre-fill context ───────────────────────────────────────────
// A one-time snapshot of canvas context used to pre-populate the Distribution
// card when it is first created (e.g. chi² params from a Two-Way Table card).

export interface DistributionPreFill {
  dist: 'normal' | 't' | 'chi2' | 'binomial' | 'geometric'
  df?: number
  mean?: number
  sd?: number
  calcMode: 'area' | 'inverse'
  areaTail: 'left' | 'between' | 'right'
  /** Pre-filled bound value (right-tail lower bound, or left-tail upper bound) */
  bound?: number
  sourceLabel: string
}

// ─── Inference card configs ───────────────────────────────────────────────────

export interface DistributionCardConfig {
  type: 'distribution'
  preFill?: DistributionPreFill
}

export interface RandomGeneratorCardConfig {
  type: 'generator'
}

export interface TestIntervalCardConfig {
  type: 'testinterval'
}

export interface SimulationCardConfig {
  type: 'simulation'
}

export interface MeansCardConfig {
  type: 'means'
  var1ColId: string | null
  var2ColId: string | null
}

export interface DiceRollerCardConfig {
  type: 'dice-roller'
  linkedResultsCardId: string | null
  trackedMode: 'sum' | 'difference'
}

export interface SimResultsCardConfig {
  type: 'sim-results'
  sourceCardId: string
  sourceLabel: string        // e.g. 'Dice Roller'
  trackedMode: 'sum' | 'difference'
  minValue: number
  maxValue: number
  values: number[]           // accumulated tracked values
}

export type CardConfig =
  | GraphCardConfig
  | SummaryCardConfig
  | TableCardConfig
  | RegressionCardConfig
  | DistributionCardConfig
  | RandomGeneratorCardConfig
  | TestIntervalCardConfig
  | SimulationCardConfig
  | MeansCardConfig
  | DiceRollerCardConfig
  | SimResultsCardConfig

export interface ExploreCard {
  id: string
  config: CardConfig
  x: number
  y: number
  width: number
  height: number
}
