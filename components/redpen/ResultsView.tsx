'use client'

import { useMemo } from 'react'
import {
  getAdministration, getAssessment, listResults, listSections, listStudents,
} from '@/lib/redpen/storage'

interface ResultsViewProps {
  administrationId: string
}

export function ResultsView({ administrationId }: ResultsViewProps) {
  const admin = useMemo(() => getAdministration(administrationId), [administrationId])
  const assessment = useMemo(() => admin ? getAssessment(admin.assessmentId) : null, [admin])
  const section = useMemo(() => admin ? listSections().find(s => s.id === admin.sectionId) ?? null : null, [admin])
  const students = useMemo(() => admin ? listStudents(admin.sectionId) : [], [admin])
  const results = useMemo(() => listResults(administrationId), [administrationId])

  if (!admin || !assessment) {
    return <div className="max-w-3xl mx-auto py-10 px-4 text-sm text-[var(--color-muted)]">Couldn&apos;t find that administration.</div>
  }

  if (results.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg text-center p-6">
        No graded sheets yet for {assessment.title} · {section?.label ?? 'this class'}.
      </div>
    )
  }

  const mean = results.reduce((sum, r) => sum + r.score, 0) / results.length
  const maxScore = results[0]?.maxScore ?? 0

  // Percent correct per question, across every response of that n from every result.
  const itemStats = assessment.answerKey
    .filter(key => results.some(r => r.responses.some(resp => resp.n === key.n)))
    .map(key => {
      const responses = results.flatMap(r => r.responses.filter(resp => resp.n === key.n))
      const correctCount = responses.filter(resp => resp.correct).length
      const pct = responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 0
      return { n: key.n, pct }
    })
    .sort((a, b) => a.n - b.n)

  const lowItems = itemStats.filter(i => i.pct < 50).length

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">{assessment.title}</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {section?.label ?? 'Unknown class'} · <span className="font-mono">{results.length}</span> sheets,{' '}
          <span className="font-mono">{assessment.questionCount}</span> questions. Mean{' '}
          <span className="font-mono">{mean.toFixed(1)}</span> of <span className="font-mono">{maxScore}</span>.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex justify-between items-baseline mb-4">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Percent correct by question
          </div>
          {lowItems > 0 && (
            <div className="font-mono text-[11px] text-[var(--color-danger)]">{lowItems} question{lowItems === 1 ? '' : 's'} under 50%</div>
          )}
        </div>
        <div className="flex items-end gap-1.5 h-36">
          {itemStats.map(item => (
            <div key={item.n} className="flex-1 flex flex-col justify-end items-center gap-1.5 h-full">
              <div className="font-mono text-[9px] text-[var(--color-muted)]">{item.pct}%</div>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(2, item.pct)}%`,
                  background: item.pct < 50 ? 'var(--color-danger)' : item.pct < 70 ? 'var(--color-gold)' : 'var(--color-accent)',
                }}
              />
              <div className="font-mono text-[9px] text-[var(--color-muted)]">{item.n}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_90px_1fr] gap-4 px-6 py-3 border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          <div>Student</div><div>Score</div><div>Percent</div><div>Missed</div>
        </div>
        {results
          .slice()
          .sort((a, b) => (students.find(s => s.id === a.studentId)?.name ?? '').localeCompare(students.find(s => s.id === b.studentId)?.name ?? ''))
          .map(r => {
            const student = students.find(s => s.id === r.studentId)
            const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0
            const missed = r.responses.filter(resp => !resp.correct).map(resp => resp.n)
            return (
              <div key={r.studentId} className="grid grid-cols-[1fr_90px_90px_1fr] gap-4 items-center px-6 py-3 border-b border-[var(--color-panel)] last:border-b-0">
                <div className="text-sm font-medium text-[var(--color-text)]">{student?.name ?? r.studentId}</div>
                <div className="font-mono text-sm">{r.score} / {r.maxScore}</div>
                <div className={`font-mono text-sm ${pct < 70 ? 'text-[var(--color-danger)]' : ''}`}>{pct}%</div>
                <div className="font-mono text-xs text-[var(--color-muted)]">{missed.length === 0 ? '—' : missed.join(', ')}</div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
