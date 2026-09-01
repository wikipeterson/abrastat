'use client'

import { AppletShell } from '@/components/layout/AppletShell'
import { SamplingWords } from '@/components/probability/SamplingWords'

export default function SamplingWordsPage() {
  return (
    <AppletShell title="Sampling Words" activeApplet="Sampling Words">
      <SamplingWords />
    </AppletShell>
  )
}
