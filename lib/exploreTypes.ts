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

export type CardConfig = GraphCardConfig | SummaryCardConfig | TableCardConfig

export interface ExploreCard {
  id: string
  config: CardConfig
  x: number
  y: number
  width: number
}
