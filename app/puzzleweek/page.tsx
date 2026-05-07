import { PuzzleWeekPreview } from '@/components/library/PuzzleWeekPreview'

export default function PuzzleWeekAliasPage() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <PuzzleWeekPreview direct />
    </main>
  )
}
