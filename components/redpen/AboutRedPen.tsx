'use client'

const STEPS = [
  { n: '1', label: 'Write your quiz', detail: 'Question doc — Claude works out the answer key for you.' },
  { n: '2', label: 'Build the assessment', detail: "Import Claude's answer key, or set it up by hand." },
  { n: '3', label: 'Print sheets', detail: 'One bubble sheet per student, pre-printed with name and ID.' },
  { n: '4', label: 'Scan & grade', detail: 'Run the completed stack through the printer, upload the PDF.' },
  { n: '5', label: 'Results', detail: 'Scores, flagged sheets, and a per-question breakdown.' },
]

interface AboutRedPenProps {
  onGetStarted: () => void
}

export function AboutRedPen({ onGetStarted }: AboutRedPenProps) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs font-mono uppercase tracking-wide text-[var(--color-accent-strong)] mb-2">
          Teachers only
        </div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)] mb-3">About RedPen</h2>
        <p className="text-[var(--color-muted)] leading-relaxed">
          RedPen scans and grades bubble-sheet assessments. Print sheets for your section, hand them out with
          your assessment, scan the completed stack on your school&apos;s copier or any printer with a document
          feeder, and get scores and summaries back.
        </p>
      </div>

      <div className="flex flex-col">
        {STEPS.map(step => (
          <div key={step.n} className="flex gap-4 py-4 border-t border-[var(--color-border)]">
            <div className="font-mono text-xl text-[var(--color-accent)] w-6 flex-shrink-0">{step.n}</div>
            <div>
              <div className="font-semibold text-[var(--color-text)] text-sm mb-0.5">{step.label}</div>
              <div className="text-sm text-[var(--color-muted)]">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onGetStarted}
        className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
      >
        New assessment
      </button>
    </div>
  )
}
