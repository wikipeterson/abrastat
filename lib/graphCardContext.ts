import { createContext, useContext } from 'react'
import { ABRA_COLORS } from './plotlyTheme'

interface GraphCardContextValue {
  hideAxisTitles: boolean
  colors: string[]
  dotSize: 'small' | 'medium' | 'large'
  showOutlierFences: boolean
}

export const GraphCardContext = createContext<GraphCardContextValue>({
  hideAxisTitles: false,
  colors: ABRA_COLORS,
  dotSize: 'medium',
  showOutlierFences: false,
})
export const useGraphCardContext = () => useContext(GraphCardContext)
