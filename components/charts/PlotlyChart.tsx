'use client'

import dynamic from 'next/dynamic'
import type { Data, Layout, Config } from 'plotly.js'
import { basePlotlyLayout, plotlyConfig } from '@/lib/plotlyTheme'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] flex items-center justify-center text-slate-400 text-sm">
      Loading chart…
    </div>
  ),
})

interface PlotlyChartProps {
  data: Data[]
  layout?: Partial<Layout>
  title?: string
  height?: number
}

export function PlotlyChart({ data, layout, title, height = 420 }: PlotlyChartProps) {
  return (
    <Plot
      data={data}
      layout={{
        ...basePlotlyLayout,
        title: title
          ? { text: title, font: { family: 'DM Sans, sans-serif', size: 14, color: '#475569' }, pad: { b: 4 } }
          : undefined,
        ...layout,
      }}
      config={plotlyConfig as Partial<Config>}
      style={{ width: '100%', height: `${height}px` }}
      useResizeHandler
    />
  )
}
