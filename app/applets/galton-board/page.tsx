'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppletShell } from '@/components/layout/AppletShell'
import { GaltonBoard } from '@/components/probability/GaltonBoard'

export default function GaltonBoardPage() {
  return (
    <ProtectedRoute>
      <AppletShell title="Galton Board" activeApplet="Galton Board">
        <GaltonBoard />
      </AppletShell>
    </ProtectedRoute>
  )
}
