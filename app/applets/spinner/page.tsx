'use client'

import { Header } from '@/components/layout/Header'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { SpinnerCard } from '@/components/probability/SpinnerCard'

export default function SpinnerPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Header centerTitle="Spinner" />
        <main className="max-w-6xl mx-auto px-4 py-6">
          <SpinnerCard />
        </main>
      </div>
    </ProtectedRoute>
  )
}
