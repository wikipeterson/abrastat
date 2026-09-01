'use client'

import { AppletShell } from '@/components/layout/AppletShell'
import { LadyTastingTea } from '@/components/probability/LadyTastingTea'

export default function LadyTastingTeaPage() {
  return (
    <AppletShell title="Lady Tasting Tea" activeApplet="Lady Tasting Tea">
      <LadyTastingTea />
    </AppletShell>
  )
}
