'use client'

import { Header } from '@/components/layout/Header'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { SpinnerCard } from '@/components/probability/SpinnerCard'

export default function SpinnerPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-6 space-y-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Spinner</h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              Prize-wheel randomizer for probability demonstrations.
            </p>
          </div>
          <SpinnerCard />
        </main>
      </div>
    </ProtectedRoute>
  )
}
