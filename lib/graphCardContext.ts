import { createContext, useContext } from 'react'
import { ABRA_COLORS } from './plotlyTheme'

interface GraphCardContextValue {
  hideAxisTitles: boolean
  colors: string[]
  dotSize: 'small' | 'medium' | 'large'
  showMeans: boolean
  showMedian: boolean
  showOutlierFences: boolean
  xAxisRange?: [number, number]
  yAxisRange?: [number, number]
}

export const GraphCardContext = createContext<GraphCardContextValue>({
  hideAxisTitles: false,
  colors: ABRA_COLORS,
  dotSize: 'medium',
  showMeans: false,
  showMedian: false,
  showOutlierFences: false,
  xAxisRange: undefined,
  yAxisRange: undefined,
})
export const useGraphCardContext = () => useContext(GraphCardContext)
