'use client'

import { AppletShell } from '@/components/layout/AppletShell'
import { SimulationCard } from '@/components/probability/SimulationCard'

export default function CoinFlipperAppletPage() {
  return (
    <AppletShell title="Coin Flipper" activeApplet="Coin Flipper">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Coin Flipper</h1>
        </div>
        <div className="p-6">
          <SimulationCard
            cardId="coin-flipper-applet"
            config={{ type: 'simulation', linkedResultsCardId: null }}
          />
        </div>
      </div>
    </AppletShell>
  )
}
