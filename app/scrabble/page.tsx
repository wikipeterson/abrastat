import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Scrabble Calculator | AbraStat',
}

export default function ScrabblePage() {
  return (
    <main className="bg-[var(--color-bg)]" style={{ height: '100dvh' }}>
      <iframe
        src="/scrabble-calculator.html"
        title="Scrabble Score Calculator"
        className="h-full w-full border-0"
      />
    </main>
  )
}
