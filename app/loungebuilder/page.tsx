import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lounge Builder | AbraStat',
}

export default function LoungeBuilderPage() {
  return (
    <main className="bg-[var(--color-bg)]" style={{ height: '100dvh' }}>
      <iframe
        src="/loungebuilder-app.html"
        title="Fourth Floor Faculty Lounge Puzzle Builder"
        className="h-full w-full border-0"
      />
    </main>
  )
}
