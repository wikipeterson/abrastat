import type { ChartType } from './chartHelpers'

export interface ManualTwoWayTableSnapshot {
  explName: string
  respName: string
  rowLabels: string[]
  colLabels: string[]
  cells: number[][]
}

export interface ManualScatterSnapshot {
  xName: string
  yName: string
  points: Array<{
    x: number
    y: number
    group?: string
    color?: string
  }>
}

export interface DataGridCardConfig {
  type: 'data-grid'
}

export interface GraphCardConfig {
  type: 'graph'
  xColId: string | null
  yColId: string | null
  groupColId: string | null
  title?: string
  xLabel?: string
  yLabel?: string
  colorPalette?: string
  dotSize?: 'small' | 'medium' | 'large'
  showOutlierFences?: boolean
  chartType?: ChartType | null
  bestFitMode?: 'none' | 'overall' | 'group'
  barValueMode?: 'count' | 'percent'
  manualTable?: ManualTwoWayTableSnapshot
  manualScatter?: ManualScatterSnapshot
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

export interface TableOutputCardConfig {
  type: 'table-output'
  rowsColId: string | null
  colsColId: string | null
  manualTable?: ManualTwoWayTableSnapshot
}

export interface RegressionCardConfig {
  type: 'regression'
  xColId: string | null
  yColId: string | null
  groupColId: string | null
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

export interface ProportionsCardConfig {
  type: 'proportions'
  var1ColId: string | null
  var2ColId: string | null
}

export interface TwoPropRandomizationCardConfig {
  type: 'two-prop-randomization'
  var1ColId: string | null
  var2ColId: string | null
}

export interface SimulationCardConfig {
  type: 'simulation'
  linkedResultsCardId?: string | null
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

export interface CompareNormalsCardConfig {
  type: 'compare-normals'
}

export interface SimResultsCardConfig {
  type: 'sim-results'
  sourceCardId: string
  sourceLabel: string        // e.g. 'Dice Roller'
  valueLabel?: string
  trackedMode: 'sum' | 'difference'
  valueMode?: 'count' | 'proportion'
  thresholdOp?: '<' | '<=' | '>' | '>='
  thresholdValue?: number
  supportsDifference: boolean
  minValue: number
  maxValue: number
  rolls: number[][]
  values: number[]           // accumulated tracked values
}

export type CardConfig =
  | DataGridCardConfig
  | GraphCardConfig
  | SummaryCardConfig
  | TableCardConfig
  | TableOutputCardConfig
  | RegressionCardConfig
  | DistributionCardConfig
  | CompareNormalsCardConfig
  | RandomGeneratorCardConfig
  | ProportionsCardConfig
  | TwoPropRandomizationCardConfig
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
  minimized?: boolean
}
