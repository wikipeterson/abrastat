export type ChartType = 'dot' | 'histogram' | 'box' | 'scatter' | 'bar' | 'pie' | 'segmented' | 'normalprob'
export type Orientation = 'h' | 'v'

export const CHART_META: Record<ChartType, { label: string; icon: string }> = {
  dot:       { label: 'Dot Plot',      icon: '⚫' },
  histogram: { label: 'Histogram',     icon: '📊' },
  box:       { label: 'Box Plot',      icon: '📦' },
  scatter:   { label: 'Scatter',       icon: '📈' },
  bar:       { label: 'Bar Chart',     icon: '🔢' },
  pie:       { label: 'Pie Chart',     icon: '🥧' },
  segmented: { label: 'Segmented Bar', icon: '🟦' },
  normalprob:{ label: 'Normal Prob',   icon: '📉' },
}

export function inferCharts(
  hType: 'numeric' | 'categorical' | null,
  vType: 'numeric' | 'categorical' | null,
  groupType: 'numeric' | 'categorical' | null,
): { primary: ChartType | null; alternatives: ChartType[]; orientation: Orientation } {
  const hasH = hType !== null
  const hasV = vType !== null

  if (hasH !== hasV) {
    const type = hType ?? vType!
    const orientation: Orientation = hasH ? 'h' : 'v'

    if (type === 'numeric') {
      const alts: ChartType[] = ['histogram', 'box']
      if (!groupType) alts.push('normalprob')
      return { primary: 'dot', alternatives: alts, orientation }
    }

    if (type === 'categorical') {
      if (groupType === 'categorical' && hasH) return { primary: 'segmented', alternatives: ['pie'], orientation }
      return { primary: 'bar', alternatives: ['pie'], orientation }
    }
  }

  if (hType === 'numeric' && vType === 'numeric') {
    return { primary: 'scatter', alternatives: [], orientation: 'h' }
  }

  if (hType === 'categorical' && vType === 'numeric') {
    return { primary: 'box', alternatives: ['dot'], orientation: 'h' }
  }

  return { primary: null, alternatives: [], orientation: 'h' }
}
