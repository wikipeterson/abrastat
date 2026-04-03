'use client'

import { Header } from '@/components/layout/Header'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { TwoPropRandomizationTest } from '@/components/inference/TwoPropRandomizationTest'

export default function TwoPropPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-6 space-y-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">
              Two-Proportion Randomization Test
            </h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              Simulate the null hypothesis: outcomes are fixed, group membership is random.
            </p>
          </div>
          <TwoPropRandomizationTest />
        </main>
      </div>
    </ProtectedRoute>
  )
}
