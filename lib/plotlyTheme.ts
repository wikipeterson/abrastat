export const ABRA_COLORS = [
  '#2EC4B6',   // brand teal (primary)
  '#F5A623',   // brand amber
  '#1A8C80',   // brand dark teal
  '#0D4F49',   // brand forest
  '#7FD9D3',   // brand light teal
  '#6366F1',   // indigo
  '#EF4444',   // red
  '#EC4899',   // pink
]

export const COLOR_PALETTES = {
  default:    ['#2EC4B6', '#F5A623', '#1A8C80', '#6366F1', '#EF4444', '#EC4899', '#0D4F49', '#7FD9D3'],
  colorblind: ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#D55E00', '#CC79A7', '#F0E442', '#999999'],
  warm:       ['#E63946', '#F4A261', '#FFBE0B', '#F72585', '#FF6B6B', '#FB5607', '#E9C46A', '#C9184A'],
  cool:       ['#4361EE', '#4CC9F0', '#7209B7', '#06D6A0', '#118AB2', '#4895EF', '#3A0CA3', '#480CA8'],
  pastel:     ['#FFB3C1', '#A2C5F5', '#C3B1E1', '#B5EAD7', '#FFDAC1', '#C7CEEA', '#B8E0D2', '#F8C8D4'],
} as const

export type PaletteName = keyof typeof COLOR_PALETTES

const axis = {
  showgrid: false,
  showline: true,
  linecolor: '#0D4F49',
  linewidth: 1.5,
  ticks: 'outside' as const,
  tickcolor: '#0D4F49',
  ticklen: 5,
  zeroline: false,
  automargin: true,
}

export const basePlotlyLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#FFFFFF',
  font: {
    family: 'DM Sans, sans-serif',
    color: '#0D4F49',
    size: 12,
  },
  margin: { t: 36, r: 24, b: 56, l: 60 },
  hoverlabel: {
    bgcolor: '#0D4F49',
    font: { color: '#FFFFFF', family: 'DM Sans, sans-serif', size: 12 },
    bordercolor: '#0D4F49',
  },
  xaxis: axis,
  yaxis: axis,
  colorway: ABRA_COLORS,
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
