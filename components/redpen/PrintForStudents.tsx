'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getAdministration, getAssessment, listSections, listStudents, listResults,
} from '@/lib/redpen/storage'
import {
  AnswerValue, RedPenAdministration, RedPenAssessment, RedPenResult, RedPenSection, RedPenStudent,
} from '@/lib/redpen/types'
import { useAuth } from '@/components/auth/AuthProvider'
import { RedPenError, RedPenLoading } from './RedPenStatus'

interface PrintForStudentsProps {
  administrationId: string
  onDone: () => void
}

interface Loaded {
  admin: RedPenAdministration
  assessment: RedPenAssessment
  section: RedPenSection | null
  students: RedPenStudent[]
  results: RedPenResult[]
}

function formatAnswer(v: AnswerValue | null): string {
  if (v === null) return '—'
  return Array.isArray(v) ? v.join(', ') : v
}

// Unlike the bubble sheet (SheetPrintView), this report is never scanned back in, so it isn't
// bound to the fiducial/machine-read geometry in lib/redpen/geometry.ts — it can use the app's
// real --color-* tokens and ordinary flow layout instead of forced black ink and absolute inch
// math. Still real-inch page size and one page per student, same portal-onto-<body> print
// pattern as SheetPrintView (app shell hides itself via print:hidden; see app/workspace/page.tsx).
function StudentReport({
  assessment, student, result, sectionLabel, date,
}: {
  assessment: RedPenAssessment; student: RedPenStudent; result: RedPenResult; sectionLabel: string; date: string
}) {
  const half = Math.ceil(result.responses.length / 2)
  const colA = result.responses.slice(0, half)
  const colB = result.responses.slice(half)

  function renderRow(resp: RedPenResult['responses'][number]) {
    const key = assessment.answerKey.find(e => e.n === resp.n)
    return (
      <div key={resp.n} className="flex items-center gap-3 py-1.5 border-t border-[var(--color-border)] text-sm">
        <div className="font-mono text-xs text-[var(--color-muted)] w-6 text-right">{resp.n}</div>
        <div className={`font-mono w-20 ${resp.correct ? 'text-[var(--color-text)]' : 'text-[var(--color-danger)] font-semibold'}`}>
          {formatAnswer(resp.given)}
          {!resp.correct && ' ✗'}
        </div>
        {!resp.correct && (
          <div className="font-mono text-xs text-[var(--color-muted)]">→ {formatAnswer(key?.answer ?? null)}</div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ width: '8.5in', height: '11in', padding: '0.6in', boxSizing: 'border-box', breakAfter: 'page' }}
      className="bg-[var(--color-surface)] text-[var(--color-text)]"
    >
      <div className="flex justify-between items-start border-b-2 border-[var(--color-text)] pb-3 mb-4">
        <div>
          <div className="font-serif italic text-lg font-semibold">{assessment.title}</div>
          <div className="font-mono text-xs text-[var(--color-muted)] mt-0.5">
            {sectionLabel.toUpperCase()} · {date}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{student.name}</div>
          <div className="font-mono text-xl text-[var(--color-accent-strong)] mt-0.5">
            {result.score} <span className="text-sm font-normal text-[var(--color-muted)]">/ {result.maxScore}</span>
          </div>
        </div>
      </div>

      {result.flagged && (
        <div className="text-xs text-[var(--color-gold-text)] bg-[var(--color-gold-light)] rounded-md px-3 py-2 mb-4">
          One or more answers on this sheet needed a judgment call during scanning — worth a quick check before handing back.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-10">
        <div>{colA.map(renderRow)}</div>
        <div>{colB.map(renderRow)}</div>
      </div>

      <div className="mt-6 font-mono text-[10px] text-[var(--color-muted)] text-center">
        Wrong answers are marked with the correct one alongside — everything else was correct.
      </div>
    </div>
  )
}

export function PrintForStudents({ administrationId, onDone }: PrintForStudentsProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function run() {
      try {
        const admin = await getAdministration(administrationId)
        if (!admin) { if (!cancelled) setError("Couldn't find that administration."); return }
        const [assessment, sections, students, results] = await Promise.all([
          getAssessment(admin.assessmentId), listSections(user!.uid), listStudents(user!.uid, admin.sectionId),
          listResults(user!.uid, administrationId),
        ])
        if (!assessment) { if (!cancelled) setError("Couldn't find that assessment."); return }
        if (!cancelled) setLoaded({ admin, assessment, section: sections.find(s => s.id === admin.sectionId) ?? null, students, results })
      } catch {
        if (!cancelled) setError("Couldn't load this report. Try refreshing the page.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [administrationId, user])

  if (!user) return <RedPenError message="Sign in to print reports." />
  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />
  if (!loaded) return null
  const { assessment, section, students, results } = loaded
  const graded = results
    .map(r => ({ result: r, student: students.find(s => s.id === r.studentId) }))
    .filter((x): x is { result: RedPenResult; student: RedPenStudent } => !!x.student)
    .sort((a, b) => a.student.name.localeCompare(b.student.name))

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <button onClick={onDone} className="text-sm font-medium text-[var(--color-accent-strong)] hover:underline">
        ← Back to results
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Print for students</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {assessment.title} · {section?.label ?? 'Unknown section'} · one page per student, ready to hand back
            in place of their answer sheet.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={graded.length === 0}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Print all {graded.length} →
        </button>
      </div>

      {graded.length === 0 ? (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          No graded sheets yet — scan this section first.
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-lg overflow-auto bg-[#ddd] p-6 flex justify-center">
          <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center' }}>
            <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
              <StudentReport
                assessment={assessment} student={graded[0].student} result={graded[0].result}
                sectionLabel={section?.label ?? ''} date={loaded.admin.date}
              />
            </div>
          </div>
        </div>
      )}

      {typeof document !== 'undefined' && createPortal(
        <div id="redpen-print-root" className="hidden print:block">
          {graded.map(({ student, result }) => (
            <StudentReport
              key={student.id}
              assessment={assessment} student={student} result={result}
              sectionLabel={section?.label ?? ''} date={loaded.admin.date}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
