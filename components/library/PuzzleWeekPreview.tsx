'use client'

export function PuzzleWeekPreview({ direct = false }: { direct?: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
          {direct ? 'Puzzle Week' : 'Private Preview'}
        </div>
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">Puzzle Week</h2>
        <p className="mt-3 text-[var(--color-muted)]">
          This section is now wired into AbraStat and ready to become its own experience.
          For now, it gives us a clean place to build the weekly puzzle flow.
        </p>
      </div>
    </div>
  )
}
