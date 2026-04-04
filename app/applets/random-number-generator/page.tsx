'use client'

import { AppletShell } from '@/components/layout/AppletShell'
import { RandomGeneratorCard } from '@/components/probability/RandomGeneratorCard'

export default function RandomNumberGeneratorAppletPage() {
  return (
    <AppletShell title="Random Number Generator" activeApplet="Random Number Generator">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Random Number Generator</h1>
        </div>
        <div className="p-6">
          <RandomGeneratorCard />
        </div>
      </div>
    </AppletShell>
  )
}
