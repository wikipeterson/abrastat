'use client'

import { useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { Data, Layout, Config } from 'plotly.js'
import { basePlotlyLayout, plotlyConfig, getChartColorway } from '@/lib/plotlyTheme'

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
  height?: number
  /**
   * fill  — (default) observe the wrapper's rendered height and match Plotly to it.
   *          Use this for resizable explore cards where the parent has an explicit height.
   * fixed — render Plotly at exactly `height` px with no ResizeObserver.
   *          Use this for game cards, stat cards, or any context without a bounded parent.
   */
  mode?: 'fill' | 'fixed'
}

export function PlotlyChart({ data, layout, title, height = 360, mode = 'fill' }: PlotlyChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [plotSize, setPlotSize] = useState({ width: 0, height })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function updateSize(width: number, nextHeight: number) {
      if (width <= 0 || nextHeight <= 0) return
      setPlotSize(prev =>
        prev.width === Math.floor(width) && prev.height === Math.floor(nextHeight)
          ? prev
          : { width: Math.floor(width), height: Math.floor(nextHeight) }
      )
    }

    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      const nextHeight = mode === 'fixed' ? height : rect.height
      if (rect.width > 50 && nextHeight > 50) updateSize(rect.width, nextHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height, mode])

  const resolvedWidth = plotSize.width > 0 ? plotSize.width : undefined
  const resolvedHeight =
    mode === 'fixed'
      ? height
      : plotSize.height > 0
        ? plotSize.height
        : height
  const layoutSignature = JSON.stringify({
    title,
    xaxis: layout?.xaxis,
    yaxis: layout?.yaxis,
    margin: layout?.margin,
    showlegend: layout?.showlegend,
    annotations: layout?.annotations,
    shapes: layout?.shapes,
  })
  let layoutHash = 0
  for (let i = 0; i < layoutSignature.length; i++) {
    layoutHash = (layoutHash * 31 + layoutSignature.charCodeAt(i)) >>> 0
  }
  const revision = (((resolvedWidth ?? 0) * 10007) ^ ((resolvedHeight ?? 0) * 101) ^ layoutHash) >>> 0

  const wrapStyle =
    mode === 'fixed'
      ? { width: '100%', height: `${height}px` }
      : { width: '100%', height: '100%' }

  const mergedLayout: Partial<Layout> = {
    ...basePlotlyLayout,
    colorway: getChartColorway(),
    ...layout,
    font: {
      ...basePlotlyLayout.font,
      ...layout?.font,
    },
    margin: {
      ...basePlotlyLayout.margin,
      ...layout?.margin,
    },
    hoverlabel: {
      ...basePlotlyLayout.hoverlabel,
      ...layout?.hoverlabel,
    },
    xaxis: {
      ...basePlotlyLayout.xaxis,
      ...layout?.xaxis,
    },
    yaxis: {
      ...basePlotlyLayout.yaxis,
      ...layout?.yaxis,
    },
    title: title
      ? { text: title, font: { family: 'DM Sans, sans-serif', size: 14, color: '#475569' }, pad: { b: 4 } }
      : undefined,
    autosize: false,
    ...(resolvedWidth ? { width: resolvedWidth } : {}),
    height: resolvedHeight,
  }

  return (
    <div ref={wrapRef} style={wrapStyle}>
      <Plot
        data={data}
        layout={mergedLayout}
        config={plotlyConfig as Partial<Config>}
        style={{ width: '100%', height: '100%' }}
        revision={revision}
        useResizeHandler
      />
    </div>
  )
}
