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

// ─── Inference card configs (scaffolded) ──────────────────────────────────────

export interface DistributionCardConfig {
  type: 'distribution'
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

export type CardConfig =
  | GraphCardConfig
  | SummaryCardConfig
  | TableCardConfig
  | RegressionCardConfig
  | DistributionCardConfig
  | RandomGeneratorCardConfig
  | TestIntervalCardConfig
  | SimulationCardConfig

export interface ExploreCard {
  id: string
  config: CardConfig
  x: number
  y: number
  width: number
  height: number
}
