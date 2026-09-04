// AbraStat Teacher — pricing/benefits page (design_handoff_landing_teacher/"AbraStat Teacher.html").
// Pure presentation: no auth check, no billing wiring. Every Teacher-gated feature listed here
// (public dataset publishing, RedPen, polls, per-student dataset copy links) keeps working
// exactly as it does today elsewhere in the app — this page is informational ("Coming soon"),
// not an active paywall, since there's no way to actually purchase yet.

import Link from 'next/link'

const FEATURES = [
  {
    title: 'Public datasets',
    description: 'Publish a dataset so any AbraStat user can find and analyze it — great for sharing class data, a study you ran, or example datasets for others to practice on.',
  },
  {
    title: 'RedPen bubble grader',
    description: 'Print bubble sheets, scan and upload students’ completed assessments, and get scored papers back automatically.',
  },
  {
    title: 'Dataset copy links',
    description: 'Generate a link that gives each student their own private copy of a dataset to work in — no accidental shared edits, no setup per student.',
  },
  {
    title: 'Create polls',
    description: 'Build class-code-gated or public polls, collect responses live, and send results straight into the Lab as a dataset.',
  },
]

const COMPARISON: { feature: string; free: boolean; teacher: boolean }[] = [
  { feature: 'Save & analyze datasets', free: true, teacher: true },
  { feature: 'Access public datasets', free: true, teacher: true },
  { feature: 'Run simulations', free: true, teacher: true },
  { feature: 'Respond to polls', free: true, teacher: true },
  { feature: 'Publish a dataset publicly', free: false, teacher: true },
  { feature: 'Create polls (class or public)', free: false, teacher: true },
  { feature: 'Generate per-student dataset copy links', free: false, teacher: true },
  { feature: 'RedPen bubble grader', free: false, teacher: true },
]

export default function AbraStatTeacherPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
          ← AbraStat
        </Link>

        <div className="mt-6">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--color-gold-text)] bg-[var(--color-gold-light)] px-2.5 py-1.5 rounded-full">
            Coming soon
          </span>
          <h1 className="font-serif italic font-semibold text-3xl sm:text-4xl text-[var(--color-text)] mt-4 mb-2">
            AbraStat Teacher
          </h1>
          <p className="text-[var(--color-muted)] text-base leading-relaxed max-w-xl mb-8">
            Everything in AbraStat, plus the tools built for running a classroom: publish datasets
            for your students, grade bubble sheets automatically, and share live copies of a
            dataset with one link.
          </p>

          <div className="flex items-baseline gap-2 mb-8">
            <span className="font-mono text-4xl font-bold text-[var(--color-accent-strong)]">$3</span>
            <span className="text-sm text-[var(--color-muted)]">/ month, billed annually · or $5 month-to-month</span>
          </div>

          <button
            disabled
            className="px-6 py-3.5 rounded-xl bg-[var(--color-gold)] text-white text-[15px] font-bold opacity-55 cursor-not-allowed mb-4"
          >
            Coming soon
          </button>
          <p className="text-sm font-bold text-[var(--color-accent-strong)] mb-1.5">
            First month free on the monthly plan — cancel anytime before it ends and you won&apos;t be charged.
          </p>
          <p className="text-[13.5px] text-[var(--color-muted)] leading-relaxed mb-10 max-w-xl">
            <b className="text-[var(--color-text)]">Scholarships are available.</b> While we need to
            function as a business, we never want money to be the reason why someone can&apos;t
            benefit from what we&apos;ve built. If you truly can&apos;t afford the cost of
            membership, email{' '}
            <a href="mailto:support@abrastat.com" className="font-bold text-[var(--color-accent-strong)]">
              support@abrastat.com
            </a>{' '}
            and we&apos;ll set you up with free Teacher access, no questions asked.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-[0_1px_2px_rgba(8,38,33,0.05),0_12px_28px_-18px_rgba(8,38,33,0.32)]"
              >
                <div className="flex items-center gap-2 font-bold text-[15px] text-[var(--color-text)] mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-gold)] flex-shrink-0" />
                  {f.title}
                </div>
                <p className="text-[13.5px] text-[var(--color-muted)] leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>

          <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden mb-10">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] bg-[var(--color-panel)] px-4.5 py-3 border-b border-[var(--color-border)]">
                    Feature
                  </th>
                  <th className="text-center w-28 font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] bg-[var(--color-panel)] px-4.5 py-3 border-b border-[var(--color-border)]">
                    Free
                  </th>
                  <th className="text-center w-28 font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] bg-[var(--color-panel)] px-4.5 py-3 border-b border-[var(--color-border)]">
                    Teacher
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.feature} className={i === COMPARISON.length - 1 ? '' : 'border-b border-[var(--color-border)]'}>
                    <td className="px-4.5 py-3">{row.feature}</td>
                    <td className="text-center px-4.5 py-3">
                      {row.free ? <span className="font-bold text-[var(--color-accent-strong)]">✓</span> : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="text-center px-4.5 py-3">
                      {row.teacher ? <span className="font-bold text-[var(--color-accent-strong)]">✓</span> : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="font-bold text-sm text-[var(--color-text)] mt-4">Do my students need to pay?</div>
            <p className="text-[13.5px] text-[var(--color-muted)] leading-relaxed mt-1">
              No — answering polls, opening a shared dataset copy, and everything else a student does stays free.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
