export type ColumnType = 'numeric' | 'categorical'

export interface ColumnMeta {
  name: string
  type: ColumnType
}

export interface GridColumn extends ColumnMeta {
  id: string
  computedFormula?: string
}

export interface GridState {
  columns: GridColumn[]
  rows: Record<string, string | number>[]
}

export interface WorkspaceCardMeta {
  minimized?: boolean
}

export interface DatasetVariableInfo {
  name: string
  description: string
}

export interface DatasetMeta {
  id: string
  ownerId: string
  ownerName: string
  ownerPhotoURL: string
  name: string
  description: string
  emoji: string
  isPublic: boolean
  rowCount: number
  columnCount: number
  columns: ColumnMeta[]
  tags: string[]
  source?: string
  sourceUrl?: string
  citation?: string
  notes?: string
  variableInfo?: DatasetVariableInfo[]
  createdAt: Date
  updatedAt: Date
}

export interface SummaryResult {
  column: string
  n: number
  mean: number
  median: number
  stdDev: number
  variance: number
  min: number
  max: number
  range: number
  q1: number
  q3: number
  iqr: number
  outliers: number[]
}

export interface FrequencyRow {
  value: string
  count: number
  percent: number
}
