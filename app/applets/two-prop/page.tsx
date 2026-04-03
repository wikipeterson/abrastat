'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppletShell } from '@/components/layout/AppletShell'
import { TwoPropRandomizationTest } from '@/components/inference/TwoPropRandomizationTest'

export default function TwoPropPage() {
  return (
    <ProtectedRoute>
      <AppletShell title="Two-Proportion Randomization Test" activeApplet="Two-Prop Randomization">
          <TwoPropRandomizationTest />
      </AppletShell>
    </ProtectedRoute>
  )
}
