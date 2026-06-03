// Categorical ramp — brand-anchored, distinct on white, ordered for legibility
export const CHART_CATEGORICAL = [
  '#16A89B', // teal
  '#E8920C', // gold
  '#E15B4C', // coral
  '#4C6EF5', // indigo
  '#9C5CF0', // violet
  '#5A726E', // slate
]

// Sequential ramp — for density / count / heat (single variable)
export const CHART_SEQUENTIAL = [
  '#E2F4F1','#B6E4DE','#7FD0C7','#46B5A9','#16A89B','#0D6E64','#0A4A43',
]

// Classroom / projector ramp — more saturated, maximally hue-separated for washed-out displays
export const CHART_CATEGORICAL_CLASSROOM = [
  '#0C8074', // teal
  '#D97706', // amber
  '#DC2626', // red
  '#2563EB', // blue
  '#7C3AED', // violet
  '#475569', // slate
]

export const ABRA_COLORS = CHART_CATEGORICAL

export function getChartColorway(): string[] {
  if (typeof document !== 'undefined' && document.documentElement.dataset.palette === 'classroom') {
    return CHART_CATEGORICAL_CLASSROOM
  }
  return CHART_CATEGORICAL
}

export const COLOR_PALETTES = {
  default:    ['#0F766E', '#D97706', '#2563EB', '#7C3AED', '#DC2626', '#059669', '#EA580C', '#BE185D'],
  colorblind: ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#D55E00', '#CC79A7', '#F0E442', '#999999'],
  warm:       ['#E63946', '#F4A261', '#FFBE0B', '#F72585', '#FF6B6B', '#FB5607', '#E9C46A', '#C9184A'],
  cool:       ['#4361EE', '#4CC9F0', '#7209B7', '#06D6A0', '#118AB2', '#4895EF', '#3A0CA3', '#480CA8'],
  pastel:     ['#FFB3C1', '#A2C5F5', '#C3B1E1', '#B5EAD7', '#FFDAC1', '#C7CEEA', '#B8E0D2', '#F8C8D4'],
} as const

export type PaletteName = keyof typeof COLOR_PALETTES

const axis = {
  showgrid: false,
  showline: true,
  linecolor: '#0E3D38',
  linewidth: 1.5,
  ticks: 'outside' as const,
  tickcolor: '#0E3D38',
  ticklen: 5,
  zeroline: false,
  automargin: true,
}

export const basePlotlyLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#FFFFFF',
  font: {
    family: 'DM Sans, sans-serif',
    color: '#0E3D38',
    size: 12,
  },
  margin: { t: 36, r: 24, b: 56, l: 60 },
  hoverlabel: {
    bgcolor: '#0E3D38',
    font: { color: '#FFFFFF', family: 'DM Sans, sans-serif', size: 12 },
    bordercolor: '#0E3D38',
  },
  xaxis: axis,
  yaxis: axis,
  colorway: CHART_CATEGORICAL,
}

export const plotlyConfig = {
  displaylogo: false,
  displayModeBar: false,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
  toImageButtonOptions: {
    format: 'png',
    filename: 'abrastat-chart',
    height: 600,
    width: 900,
    scale: 2,
  },
  responsive: true,
}
