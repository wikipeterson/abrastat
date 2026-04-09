'use client'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppletShell } from '@/components/layout/AppletShell'
import { DiceRollerCard } from '@/components/probability/DiceRollerCard'

export default function DiceRollerPage() {
  return (
    <ProtectedRoute>
      <AppletShell title="Dice Roller" activeApplet="Dice Roller" contentClassName="max-w-[96rem]">
        <DiceRollerCard onRemove={() => {}} hideHeader />
      </AppletShell>
    </ProtectedRoute>
  )
}
