'use client'

const STEPS: { n: string; label: string; detail?: string }[] = [
  { n: '0', label: 'Manage classes', detail: 'Import your class lists. You only need to do this once.' },
  {
    n: '1', label: 'Write your assessment',
    detail: 'Create your test or quiz and prepare to export it in a format that you can hand off to Claude (or your favorite LLM) to make the answer key for you.',
  },
  {
    n: '2', label: 'Set the answer key',
    detail: "Cut-and-paste Claude's answer key (or set the answer key yourself by choosing settings for the number of questions, number of answer choices per question, and the answer key).",
  },
  {
    n: '3', label: 'Print answer sheets',
    detail: 'RedPen creates one bubble sheet per student, pre-printed with your students’ names.',
  },
  { n: '4', label: 'Administer your assessment' },
  {
    n: '5', label: 'Scan to grade',
    detail: 'Run the completed stack of papers through a batch scanner such as your school’s copy machine. Then upload the resulting PDF.',
  },
  {
    n: '6', label: 'Results',
    detail: 'RedPen provides scored sheets to return to students as well as class summaries and an item analysis.',
  },
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
          RedPen grades bubble-sheet assessments. Unlike other apps that use your phone&apos;s camera to scan
          individual papers which you then mark, RedPen is perfect for teachers who have access to a bulk
          scanner that can scan all your papers at once.
        </p>
      </div>

      <div>
        <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1">
          Your RedPen workflow
        </div>
        <div className="flex flex-col">
          {STEPS.map(step => (
            <div key={step.n} className="flex gap-4 py-4 border-t border-[var(--color-border)]">
              <div className="font-mono text-xl text-[var(--color-accent)] w-6 flex-shrink-0">{step.n}</div>
              <div>
                <div className="font-semibold text-[var(--color-text)] text-sm mb-0.5">{step.label}</div>
                {step.detail && <div className="text-sm text-[var(--color-muted)]">{step.detail}</div>}
              </div>
            </div>
          ))}
        </div>
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
