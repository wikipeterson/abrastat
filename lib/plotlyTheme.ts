export const ABRA_COLORS = [
  '#0EA5A0',   // teal
  '#F59E0B',   // amber
  '#6366F1',   // indigo
  '#EF4444',   // red
  '#10B981',   // emerald
  '#EC4899',   // pink
  '#8B5CF6',   // violet
  '#F97316',   // orange
]

const axis = {
  showgrid: false,
  showline: true,
  linecolor: '#334155',
  linewidth: 1.5,
  ticks: 'outside' as const,
  tickcolor: '#334155',
  ticklen: 5,
  zeroline: false,
  automargin: true,
}

export const basePlotlyLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: '#FFFFFF',
  font: {
    family: 'DM Sans, sans-serif',
    color: '#1E293B',
    size: 12,
  },
  margin: { t: 36, r: 24, b: 56, l: 60 },
  hoverlabel: {
    bgcolor: '#1E293B',
    font: { color: '#FFFFFF', family: 'DM Sans, sans-serif', size: 12 },
    bordercolor: '#1E293B',
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
