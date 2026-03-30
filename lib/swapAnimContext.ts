import { createContext, useContext } from 'react'

export interface SwapAnimState {
  /** Full zone ID: "{cardId}:{zoneName}" */
  zoneId: string
  /** Direction the displaced chip appears to arrive from */
  direction: 'from-left' | 'from-right' | 'pop'
}

export const SwapAnimContext = createContext<SwapAnimState | null>(null)

export function useSwapAnim(): SwapAnimState | null {
  return useContext(SwapAnimContext)
}
