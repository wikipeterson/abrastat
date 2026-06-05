import type { ChartType } from './chartHelpers'
import { inferCharts } from './chartHelpers'
import type {
  CardConfig,
  GraphCardConfig,
  MeansCardConfig,
  OnePropRandomizationCardConfig,
  ProportionsCardConfig,
  RegressionByEyeCardConfig,
  RegressionCardConfig,
  SummaryCardConfig,
  TableCardConfig,
  TwoMeanRandomizationCardConfig,
  TwoPropRandomizationCardConfig,
} from './exploreTypes'
import type { GridColumn } from '@/types'

export interface SelectedAnalysisColumn {
  id: string
  name: string
  type: 'numeric' | 'categorical'
}

export interface Suggestion {
  type: CardConfig['type']
  label: string
  icon: string
  reason: string
  recommended?: boolean
  chartTypeHint?: ChartType
}

interface BuildInitialConfigOptions {
  chartTypeHint?: ChartType
}

function pickByType(selectedCols: SelectedAnalysisColumn[]) {
  const nums = selectedCols.filter(col => col.type === 'numeric')
  const cats = selectedCols.filter(col => col.type === 'categorical')
  return { nums, cats }
}

function formatName(name: string | undefined) {
  return name ?? 'this variable'
}

function graphConfigFromSelection(
  selectedCols: SelectedAnalysisColumn[],
  chartTypeHint?: ChartType,
): Partial<GraphCardConfig> {
  const { nums, cats } = pickByType(selectedCols)

  if (selectedCols.length === 1) {
    const [only] = selectedCols
    return {
      type: 'graph',
      xColId: only.id,
      yColId: null,
      groupColId: null,
      chartType: chartTypeHint,
    }
  }

  if (nums.length >= 2) {
    return {
      type: 'graph',
      xColId: nums[0].id,
      yColId: nums[1].id,
      groupColId: null,
      chartType: chartTypeHint,
    }
  }

  if (nums.length >= 1 && cats.length >= 1) {
    return {
      type: 'graph',
      xColId: cats[0].id,
      yColId: nums[0].id,
      groupColId: null,
      chartType: chartTypeHint,
    }
  }

  if (cats.length >= 2) {
    return {
      type: 'graph',
      xColId: cats[0].id,
      yColId: null,
      groupColId: cats[1].id,
      chartType: chartTypeHint,
    }
  }

  return {
    type: 'graph',
    xColId: null,
    yColId: null,
    groupColId: null,
    chartType: chartTypeHint,
  }
}

export function normalizeGraphConfigForColumns(
  cfg: GraphCardConfig,
  columns: Array<Pick<GridColumn, 'id' | 'type'>>,
  chartTypeHint?: ChartType,
): GraphCardConfig {
  if (cfg.manualScatter) {
    return {
      ...cfg,
      chartType: chartTypeHint ?? 'scatter',
      bestFitMode: cfg.bestFitMode ?? 'none',
      barValueMode: cfg.barValueMode ?? 'count',
      dotSize: cfg.dotSize ?? 'medium',
      showMeans: cfg.showMeans ?? false,
      showMedian: cfg.showMedian ?? false,
      showOutlierFences: cfg.showOutlierFences ?? false,
    }
  }

  const xType = cfg.xColId ? (columns.find(c => c.id === cfg.xColId)?.type ?? null) : null
  const yType = cfg.yColId ? (columns.find(c => c.id === cfg.yColId)?.type ?? null) : null
  const usesAxisGrouping =
    (xType === 'numeric' && yType === 'categorical') ||
    (xType === 'categorical' && yType === 'numeric')
  const normalizedGroupColId = usesAxisGrouping ? null : cfg.groupColId
  const groupType = normalizedGroupColId ? (columns.find(c => c.id === normalizedGroupColId)?.type ?? null) : null
  const { primary, alternatives } = inferCharts(xType, yType, groupType)
  const valid = primary ? [primary, ...alternatives] : []
  const baseCfg = usesAxisGrouping && cfg.groupColId !== null
    ? { ...cfg, groupColId: null }
    : cfg
  const preferredChartType = chartTypeHint ?? baseCfg.chartType ?? primary ?? null

  let chartType: ChartType | null = preferredChartType
  if (valid.length > 0 && chartType && !valid.includes(chartType)) {
    chartType = primary
  }
  if (valid.length === 0) {
    chartType = chartTypeHint && valid.includes(chartTypeHint) ? chartTypeHint : null
  }

  return {
    ...baseCfg,
    chartType,
    bestFitMode: baseCfg.bestFitMode ?? 'none',
    barValueMode: baseCfg.barValueMode ?? 'count',
    dotSize: baseCfg.dotSize ?? 'medium',
    showMeans: baseCfg.showMeans ?? false,
    showMedian: baseCfg.showMedian ?? false,
    showOutlierFences: baseCfg.showOutlierFences ?? false,
  }
}

export function buildInitialConfig(
  type: CardConfig['type'],
  selectedCols: SelectedAnalysisColumn[],
  options: BuildInitialConfigOptions = {},
): Partial<CardConfig> | null {
  const { nums, cats } = pickByType(selectedCols)

  if (type === 'graph') {
    return graphConfigFromSelection(selectedCols, options.chartTypeHint)
  }

  if (type === 'summary') {
    const config: SummaryCardConfig = {
      type: 'summary',
      variableColIds: nums.map(col => col.id),
      groupColId: cats[0]?.id ?? null,
    }
    return config
  }

  if (type === 'table') {
    const config: TableCardConfig = {
      type: 'table',
      rowsColId: cats[0]?.id ?? null,
      colsColId: cats[1]?.id ?? null,
    }
    return config
  }

  if (type === 'regression') {
    const config: RegressionCardConfig = {
      type: 'regression',
      xColId: nums[0]?.id ?? null,
      yColId: nums[1]?.id ?? null,
      groupColId: cats[0]?.id ?? null,
    }
    return config
  }

  if (type === 'regression-by-eye') {
    const config: RegressionByEyeCardConfig = {
      type: 'regression-by-eye',
      xColId: nums[0]?.id ?? null,
      yColId: nums[1]?.id ?? null,
    }
    return config
  }

  if (type === 'means') {
    const var1 = nums[0]?.id ?? null
    const remaining = selectedCols.find(col => col.id !== var1)
    const config: MeansCardConfig = {
      type: 'means',
      var1ColId: var1,
      var2ColId: remaining?.id ?? null,
    }
    return config
  }

  if (type === 'proportions') {
    const config: ProportionsCardConfig = {
      type: 'proportions',
      var1ColId: cats[0]?.id ?? null,
      var2ColId: cats[1]?.id ?? null,
    }
    return config
  }

  if (type === 'one-prop-randomization') {
    const config: OnePropRandomizationCardConfig = {
      type: 'one-prop-randomization',
      var1ColId: cats[0]?.id ?? null,
    }
    return config
  }

  if (type === 'two-prop-randomization') {
    const config: TwoPropRandomizationCardConfig = {
      type: 'two-prop-randomization',
      var1ColId: cats[0]?.id ?? null,
      var2ColId: cats[1]?.id ?? null,
    }
    return config
  }

  if (type === 'two-mean-randomization') {
    const config: TwoMeanRandomizationCardConfig = {
      type: 'two-mean-randomization',
      var1ColId: nums[0]?.id ?? null,
      var2ColId: cats[0]?.id ?? null,
      dataShape: 'grouping',
    }
    return config
  }

  return null
}

export function getSuggestionReadingLine(selectedCols: SelectedAnalysisColumn[]): string | null {
  const { nums, cats } = pickByType(selectedCols)

  if (nums.length >= 1 && cats.length === 0 && selectedCols.length === 1) {
    return 'One quantitative variable — describe its distribution.'
  }
  if (cats.length >= 1 && nums.length === 0 && selectedCols.length === 1) {
    return 'One categorical variable — describe the category counts.'
  }
  if (nums.length >= 2 && selectedCols.length >= 2) {
    return 'Two quantitative variables — look for a relationship.'
  }
  if (nums.length >= 1 && cats.length >= 1) {
    return 'A quantitative measure split by a category — compare the groups.'
  }
  if (cats.length >= 2) {
    return 'Two categorical variables — see how they break down together.'
  }
  return null
}

export function suggestAnalyses(selectedCols: SelectedAnalysisColumn[]): Suggestion[] {
  const { nums, cats } = pickByType(selectedCols)
  const first = selectedCols[0]
  const second = selectedCols[1]
  const firstNum = nums[0]
  const secondNum = nums[1]
  const firstCat = cats[0]
  const secondCat = cats[1]

  if (selectedCols.length === 1 && first?.type === 'numeric') {
    return [
      {
        type: 'graph',
        label: 'Dot Plot',
        icon: '⚫',
        chartTypeHint: 'dot',
        recommended: true,
        reason: `See the shape, center and spread of ${formatName(first.name)}.`,
      },
      {
        type: 'graph',
        label: 'Box Plot',
        icon: '📦',
        chartTypeHint: 'box',
        reason: 'Read the median, quartiles and any outliers fast.',
      },
      {
        type: 'summary',
        label: 'Summary Statistics',
        icon: '📋',
        reason: 'Mean, SD, min, median and max.',
      },
    ]
  }

  if (selectedCols.length === 1 && first?.type === 'categorical') {
    return [
      {
        type: 'graph',
        label: 'Bar Chart',
        icon: '🔢',
        chartTypeHint: 'bar',
        recommended: true,
        reason: `Count how many cases fall in each ${formatName(first.name)}.`,
      },
      {
        type: 'summary',
        label: 'Summary Statistics',
        icon: '📋',
        reason: `A frequency table for ${formatName(first.name)}.`,
      },
    ]
  }

  if (nums.length >= 2) {
    return [
      {
        type: 'graph',
        label: 'Scatterplot',
        icon: '📈',
        chartTypeHint: 'scatter',
        recommended: true,
        reason: `Look for a relationship between ${formatName(firstNum?.name)} and ${formatName(secondNum?.name)}.`,
      },
      {
        type: 'regression',
        label: 'Regression',
        icon: '📉',
        reason: 'Fit a line and read the slope and r².',
      },
      {
        type: 'summary',
        label: 'Summary Statistics',
        icon: '📋',
        reason: 'Mean, SD, min, median and max.',
      },
    ]
  }

  if (nums.length >= 1 && cats.length >= 1) {
    return [
      {
        type: 'graph',
        label: 'Box Plot',
        icon: '📦',
        chartTypeHint: 'box',
        recommended: true,
        reason: `Compare ${formatName(firstNum?.name)} across ${formatName(firstCat?.name)}.`,
      },
      {
        type: 'graph',
        label: 'Dot Plot',
        icon: '⚫',
        chartTypeHint: 'dot',
        reason: `Every case, stacked, split by ${formatName(firstCat?.name)}.`,
      },
      {
        type: 'summary',
        label: 'Summary Statistics',
        icon: '📋',
        reason: `Mean and SD of ${formatName(firstNum?.name)} for each ${formatName(firstCat?.name)}.`,
      },
      {
        type: 'means',
        label: 'Means Test',
        icon: '📐',
        reason: `Is the difference in ${formatName(firstNum?.name)} between two ${formatName(firstCat?.name)} groups real?`,
      },
    ]
  }

  if (cats.length >= 2) {
    return [
      {
        type: 'graph',
        label: 'Segmented Bar',
        icon: '🟦',
        chartTypeHint: 'segmented',
        recommended: true,
        reason: `See how the second category breaks down within each ${formatName(firstCat?.name)}.`,
      },
      {
        type: 'table',
        label: 'Two-Way Table',
        icon: '⊞',
        reason: `Counts for every ${formatName(firstCat?.name)} × ${formatName(secondCat?.name)} combination.`,
      },
      {
        type: 'proportions',
        label: 'Proportions',
        icon: '⚖️',
        reason: 'Compare proportions across the two categories.',
      },
    ]
  }

  if (selectedCols.length >= 1) {
    return [
      {
        type: 'summary',
        label: 'Summary Statistics',
        icon: '📋',
        recommended: true,
        reason: 'Mean, SD, min, median and max.',
      },
    ]
  }

  return []
}
