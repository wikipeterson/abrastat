import { createContext, useContext } from 'react'

interface GraphCardContextValue {
  hideAxisTitles: boolean
}

export const GraphCardContext = createContext<GraphCardContextValue>({ hideAxisTitles: false })
export const useGraphCardContext = () => useContext(GraphCardContext)
