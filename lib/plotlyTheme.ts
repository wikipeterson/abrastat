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
