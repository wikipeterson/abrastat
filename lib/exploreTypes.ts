import type { ChartType } from './chartHelpers'
import type { Alternative } from './randomizationTest'

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
  xAxisMin?: string
  xAxisMax?: string
  yAxisMin?: string
  yAxisMax?: string
  colorPalette?: string
  dotSize?: 'small' | 'medium' | 'large'
  showMeans?: boolean
  showMedian?: boolean
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

export interface RegressionByEyeCardConfig {
  type: 'regression-by-eye'
  xColId: string | null
  yColId: string | null
}

export interface OnePropRandomizationCardConfig {
  type: 'one-prop-randomization'
  var1ColId: string | null  // categorical variable
  stage?: 'setup' | 'simulate' | 'conclude'
  sourceMode?: 'data' | 'manual'
  successLevel?: string
  manualX?: string
  manualN?: string
  manualLabel?: string
  nullP?: string
  alternative?: import('./randomizationTest').Alternative
  nullDist?: number[]
  simCount?: number
  extremeCount?: number
  showNormalCurve?: boolean
  graphView?: 'proportions' | 'counts'
  customThreshold?: string
}

export interface OnePropSimCardConfig {
  type: 'one-prop-sim'
  // Input snapshot
  n: number
  x: number            // observed successes
  successLabel: string
  failureLabel: string
  // Hypothesis settings
  nullP: string        // hypothesized proportion as string, e.g. "0.5"
  alternative: import('./randomizationTest').Alternative
  // Accumulated simulation results (xSim counts stored)
  nullDist: number[]
  simCount: number
  extremeCount: number
  showNormalCurve?: boolean
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
  stage?: 'setup' | 'simulate' | 'conclude'
  sourceMode?: 'data' | 'manual'
  successLevel?: string
  groupA?: string
  groupB?: string
  manualS1?: string
  manualN1?: string
  manualS2?: string
  manualN2?: string
  manualLabel1?: string
  manualLabel2?: string
  alternative?: import('./randomizationTest').Alternative
  nullDiff?: string
  nullDist?: number[]
  simCount?: number
  extremeCount?: number
  showNormalCurve?: boolean
}

export interface TwoPropSimCardConfig {
  type: 'two-prop-sim'
  // snapshot of the input data
  n1: number
  s1: number
  n2: number
  s2: number
  label1: string
  label2: string
  successLabel: string
  failureLabel: string
  // hypothesis settings
  alternative: Alternative
  nullDiff: string
  // accumulated results (persisted so simulations survive card moves)
  nullDist: number[]
  simCount: number
  extremeCount: number
  showNormalCurve?: boolean
}

export interface TwoMeanRandomizationCardConfig {
  type: 'two-mean-randomization'
  var1ColId: string | null
  var2ColId: string | null
  dataShape?: 'grouping' | 'two-quant'
  stage?: 'setup' | 'simulate' | 'conclude'
  sourceMode?: 'data' | 'manual'
  groupA?: string
  groupB?: string
  manualLabel1?: string
  manualLabel2?: string
  manualValues1?: string
  manualValues2?: string
  alternative?: import('./randomizationTest').Alternative
  nullDiff?: string
  nullDist?: number[]
  simCount?: number
  extremeCount?: number
  showNormalCurve?: boolean
}

export interface TwoMeanSimCardConfig {
  type: 'two-mean-sim'
  // snapshot of raw values (needed to run randomization)
  values1: number[]
  values2: number[]
  label1: string
  label2: string
  // hypothesis settings
  alternative: Alternative
  nullDiff: string
  // accumulated results
  nullDist: number[]
  simCount: number
  extremeCount: number
  showNormalCurve?: boolean
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
  | RegressionByEyeCardConfig
  | OnePropRandomizationCardConfig
  | OnePropSimCardConfig
  | DistributionCardConfig
  | CompareNormalsCardConfig
  | RandomGeneratorCardConfig
  | ProportionsCardConfig
  | TwoPropRandomizationCardConfig
  | TwoPropSimCardConfig
  | TwoMeanRandomizationCardConfig
  | TwoMeanSimCardConfig
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
