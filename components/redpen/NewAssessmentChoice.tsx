'use client'

interface NewAssessmentChoiceProps {
  onImport: () => void
  onBuildManually: () => void
}

export function NewAssessmentChoice({ onImport, onBuildManually }: NewAssessmentChoiceProps) {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)] mb-1">New assessment</h2>
      <p className="text-sm text-[var(--color-muted)] mb-8">How do you want to set up the answer key?</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={onImport}
          className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 hover:border-[var(--color-accent)] transition-colors"
        >
          <div className="text-lg font-semibold text-[var(--color-text)] mb-2">Import from Claude</div>
          <div className="text-sm text-[var(--color-muted)] leading-relaxed mb-5">
            Send Claude your quiz, paste back its answer key, and the assessment builds prepopulated in one
            step. Recommended.
          </div>
          <div className="font-mono text-xs text-[var(--color-accent-strong)]">Start import →</div>
        </button>

        <button
          onClick={onBuildManually}
          className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 hover:border-[var(--color-accent)] transition-colors"
        >
          <div className="text-lg font-semibold text-[var(--color-text)] mb-2">Build manually</div>
          <div className="text-sm text-[var(--color-muted)] leading-relaxed mb-5">
            Set the question count and choices yourself, then click bubbles to enter the key by hand.
          </div>
          <div className="font-mono text-xs text-[var(--color-accent-strong)]">Start building →</div>
        </button>
      </div>
    </div>
  )
}
