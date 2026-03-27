'use client'

import { useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Data, Layout, Config } from 'plotly.js'
import { basePlotlyLayout, plotlyConfig } from '@/lib/plotlyTheme'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[200px] flex items-center justify-center text-slate-400 text-sm">
      Loading chart…
    </div>
  ),
})

interface PlotlyChartProps {
  data: Data[]
  layout?: Partial<Layout>
  title?: string
  height?: number   // minimum / fallback height in px; omit to fill container
}

export function PlotlyChart({ data, layout, title, height = 360 }: PlotlyChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [plotPx, setPlotPx] = useState(height)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height
      if (h && h > 50) setPlotPx(Math.floor(h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: `${height}px` }}>
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
        style={{ width: '100%', height: `${plotPx}px` }}
        useResizeHandler
      />
    </div>
  )
}
