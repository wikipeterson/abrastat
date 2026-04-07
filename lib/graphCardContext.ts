import { createContext, useContext } from 'react'
import { ABRA_COLORS } from './plotlyTheme'

interface GraphCardContextValue {
  hideAxisTitles: boolean
  colors: string[]
}

export const GraphCardContext = createContext<GraphCardContextValue>({
  hideAxisTitles: false,
  colors: ABRA_COLORS,
})
export const useGraphCardContext = () => useContext(GraphCardContext)
