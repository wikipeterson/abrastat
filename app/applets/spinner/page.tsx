'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppletShell } from '@/components/layout/AppletShell'
import { SpinnerCard } from '@/components/probability/SpinnerCard'

export default function SpinnerPage() {
  return (
    <ProtectedRoute>
      <AppletShell title="Spinner" activeApplet="Spinner">
          <SpinnerCard />
      </AppletShell>
    </ProtectedRoute>
  )
}
