'use client'

import { useEffect, useState } from 'react'
import {
  deleteUnmatchedSheet, getAdministration, getAssessment, listResults, listSections, listStudents,
  listUnmatchedSheets, saveResult,
} from '@/lib/redpen/storage'
import {
  RedPenAdministration, RedPenAssessment, RedPenResult, RedPenSection, RedPenStudent, RedPenUnmatchedSheet,
} from '@/lib/redpen/types'
import { summarizeScores } from '@/lib/redpen/scoreDistribution'
import { buildGridFromResults } from '@/lib/redpen/dataset'
import { saveDataset } from '@/lib/firestore'
import { useAuth } from '@/components/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { FlaggedAnswersModal } from './FlaggedAnswersModal'
import { RedPenError, RedPenLoading } from './RedPenStatus'

interface ResultsViewProps {
  administrationId: string
  onDone: () => void
  onPrintForStudents: () => void
  onSendToLab: (datasetId: string) => void
  onEditAssessment: (assessmentId: string) => void
}

interface Loaded {
  admin: RedPenAdministration
  assessment: RedPenAssessment
  section: RedPenSection | null
  students: RedPenStudent[]
  results: RedPenResult[]
  unmatchedSheets: RedPenUnmatchedSheet[]
}

export function ResultsView({ administrationId, onDone, onPrintForStudents, onSendToLab, onEditAssessment }: ResultsViewProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reviewing, setReviewing] = useState<RedPenResult | null>(null)
  const [assigning, setAssigning] = useState<RedPenUnmatchedSheet | null>(null)
  const [sendingToLab, setSendingToLab] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function run() {
      try {
        const admin = await getAdministration(administrationId)
        if (!admin) { if (!cancelled) setError("Couldn't find that administration."); return }
        const [assessment, sections, students, results, unmatchedSheets] = await Promise.all([
          getAssessment(admin.assessmentId), listSections(user!.uid), listStudents(user!.uid, admin.sectionId),
          listResults(user!.uid, administrationId), listUnmatchedSheets(user!.uid, administrationId),
        ])
        if (!assessment) { if (!cancelled) setError("Couldn't find that assessment."); return }
        if (!cancelled) {
          setLoaded({
            admin, assessment, section: sections.find(s => s.id === admin.sectionId) ?? null,
            students, results, unmatchedSheets,
          })
        }
      } catch {
        if (!cancelled) setError("Couldn't load results. Try refreshing the page.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [administrationId, user])

  if (!user) return <RedPenError message="Sign in to see results." />
  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />
  if (!loaded) return null
  const { assessment, section, students, results, unmatchedSheets } = loaded

  if (results.length === 0 && unmatchedSheets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 space-y-5">
        <button onClick={onDone} className="text-sm font-medium text-[var(--color-accent-strong)] hover:underline">
          ← Back to assessments
        </button>
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg text-center p-6">
          No graded sheets yet for {assessment.title} · {section?.label ?? 'this section'}.
        </div>
      </div>
    )
  }

  const distribution = summarizeScores(results)

  // Percent correct per question, across every response of that n from every result — topic
  // carried alongside so the badge/re-teach note below can group by it.
  const itemStats = assessment.answerKey
    .filter(key => results.some(r => r.responses.some(resp => resp.n === key.n)))
    .map(key => {
      const responses = results.flatMap(r => r.responses.filter(resp => resp.n === key.n))
      const correctCount = responses.filter(resp => resp.correct).length
      const pct = responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 0
      return { n: key.n, pct, topic: key.topic }
    })
    .sort((a, b) => a.n - b.n)

  const lowItems = itemStats.filter(i => i.pct < 60)
  const reteachTopics = new Map<string, number[]>()
  for (const item of lowItems) {
    if (!item.topic) continue
    reteachTopics.set(item.topic, [...(reteachTopics.get(item.topic) ?? []), item.n])
  }
  const reteachNotes = [...reteachTopics.entries()].filter(([, ns]) => ns.length >= 2)

  const flaggedResults = results.filter(r => r.flagged)
  const needsReviewCount = flaggedResults.length + unmatchedSheets.length
  const rosterCount = students.length

  function handleReviewSaved(updated: RedPenResult) {
    setLoaded(prev => prev && { ...prev, results: prev.results.map(r => (r.studentId === updated.studentId ? updated : r)) })
    setReviewing(null)
  }

  function handleAssignSaved(result: RedPenResult) {
    setLoaded(prev => prev && {
      ...prev,
      results: [...prev.results.filter(r => r.studentId !== result.studentId), result],
      unmatchedSheets: prev.unmatchedSheets.filter(u => u.id !== assigning?.id),
    })
    setAssigning(null)
  }

  async function handleSendToLab() {
    if (!user) return
    setSendingToLab(true)
    try {
      const grid = buildGridFromResults(assessment, students, results)
      const id = await saveDataset(user, assessment.title, `Results for "${assessment.title}" from AbraStat RedPen.`, '📝', false, grid)
      onSendToLab(id)
    } finally {
      setSendingToLab(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <button onClick={onDone} className="text-sm font-medium text-[var(--color-accent-strong)] hover:underline">
        ← Back to assessments
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">{assessment.title}</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {section?.label ?? 'Unknown section'} · <span className="font-mono">{assessment.questionCount}</span> questions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onEditAssessment(assessment.id)}
            className="px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] text-sm font-medium hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors whitespace-nowrap"
          >
            Edit answer key
          </button>
          <button
            onClick={onPrintForStudents}
            className="px-5 py-2.5 rounded-lg border border-[var(--color-accent)] text-[var(--color-accent-strong)] text-sm font-semibold hover:bg-[var(--color-accent-light)] transition-colors whitespace-nowrap"
          >
            Print for students →
          </button>
        </div>
      </div>

      <div className="flex gap-3.5 flex-wrap">
        <StatBox label="Graded" value={`${results.length} / ${rosterCount}`} />
        <StatBox label="Class mean" value={distribution.mean !== null ? `${Math.round(distribution.mean)}%` : '—'} />
        <StatBox label="Median" value={distribution.median !== null ? `${Math.round(distribution.median)}%` : '—'} />
        <StatBox
          label="Needs review"
          value={String(needsReviewCount)}
          tone={needsReviewCount > 0 ? 'gold' : undefined}
        />
      </div>

      {results.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1">
            Score distribution
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-3">Each dot is one student&apos;s score, grouped by percent correct.</p>
          <div className="flex items-end gap-1 h-28 border-b-2 border-[var(--color-border)] pb-1 mb-1 px-1 overflow-x-auto">
            {distribution.buckets.map(b => (
              <div key={b.start} className="flex-1 min-w-[7px] flex flex-col-reverse items-center gap-1">
                {b.entries.map((e, i) => {
                  const gold = distribution.median !== null && b.start <= distribution.median && distribution.median <= b.end
                  return (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: gold ? 'var(--color-gold)' : 'var(--color-accent)' }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="flex gap-1 px-1">
            {distribution.buckets.map((b, i) => (
              <div key={b.start} className="flex-1 min-w-[7px] text-center font-mono text-[10px] text-[var(--color-muted)]">
                {i % 4 === 0 ? `${b.start}%` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {itemStats.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
          <div className="flex justify-between items-baseline mb-1">
            <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              Item analysis — percent correct by question
            </div>
            {lowItems.length > 0 && (
              <div className="font-mono text-[11px] text-[var(--color-danger)]">{lowItems.length} question{lowItems.length === 1 ? '' : 's'} under 60%</div>
            )}
          </div>
          <div className="flex items-end gap-1.5 h-36 mt-3">
            {itemStats.map(item => (
              <div
                key={item.n}
                title={item.topic ? `Q${item.n} — ${item.topic}` : `Q${item.n}`}
                className="flex-1 flex flex-col justify-end items-center gap-1.5 h-full"
              >
                <div className="font-mono text-[9px] text-[var(--color-muted)]">{item.pct}%</div>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(2, item.pct)}%`,
                    background: item.pct < 60 ? 'var(--color-danger)' : item.pct < 75 ? 'var(--color-gold)' : 'var(--color-accent)',
                  }}
                />
                <div className="font-mono text-[9px] text-[var(--color-muted)]">{item.n}</div>
              </div>
            ))}
          </div>
          {reteachNotes.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {reteachNotes.map(([topic, ns]) => (
                <div key={topic} className="text-xs text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5">
                  Q{ns.join(', Q')} share the topic <span className="font-medium text-[var(--color-text)]">{topic}</span> and all scored under 60% — worth a re-teach before the next assessment.
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Flagged sheets</div>
          {needsReviewCount > 0 && (
            <div className="font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)]">
              {needsReviewCount} need{needsReviewCount === 1 ? 's' : ''} review
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          Low-confidence bubble reads or pages that couldn&#39;t be matched to a student — resolve before results are final.
        </p>
        {needsReviewCount === 0 ? (
          <div className="text-sm text-[var(--color-muted)]">Nothing to review — every sheet read cleanly and every page matched a student.</div>
        ) : (
          <div className="flex flex-col">
            {flaggedResults.map(r => {
              const student = students.find(s => s.id === r.studentId)
              const entries = r.logEntries ?? []
              const first = entries[0]
              const reason = first
                ? `${first.n !== undefined ? `Q${first.n} — ` : ''}${first.detail}${entries.length > 1 ? ` (+${entries.length - 1} more)` : ''}`
                : 'Needs a second look.'
              return (
                <div key={r.studentId} className="flex items-center gap-3 py-3 border-b border-[var(--color-panel)] last:border-b-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--color-danger-light)] text-[var(--color-danger)] flex items-center justify-center font-bold flex-shrink-0">?</div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--color-text)]">{student?.name ?? r.studentId}</div>
                    <div className="text-xs text-[var(--color-muted)] truncate">{reason}</div>
                  </div>
                  <button
                    onClick={() => setReviewing(r)}
                    className="ml-auto px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap"
                  >
                    Resolve
                  </button>
                </div>
              )
            })}
            {unmatchedSheets.map(u => (
              <div key={u.id} className="flex items-center gap-3 py-3 border-b border-[var(--color-panel)] last:border-b-0">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-danger-light)] text-[var(--color-danger)] flex items-center justify-center font-bold flex-shrink-0">!</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--color-text)]">Unmatched sheet — page {u.page}</div>
                  <div className="text-xs text-[var(--color-muted)] truncate">{u.reason}</div>
                </div>
                <button
                  onClick={() => setAssigning(u)}
                  className="ml-auto px-4 py-2 rounded-lg bg-[var(--color-text)] text-white text-xs font-semibold hover:brightness-125 transition-all whitespace-nowrap"
                >
                  Assign student
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {results.length > 0 && (
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
                  <div className="flex items-center gap-2">
                    {r.flagged ? (
                      <button
                        onClick={() => setReviewing(r)}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-accent-strong)] transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)] flex-shrink-0" title="Needs a second look" />
                        {student?.name ?? r.studentId}
                        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-gold-text)] underline underline-offset-2">review</span>
                      </button>
                    ) : (
                      <div className="text-sm font-medium text-[var(--color-text)]">{student?.name ?? r.studentId}</div>
                    )}
                  </div>
                  <div className="font-mono text-sm">{r.score} / {r.maxScore}</div>
                  <div className={`font-mono text-sm ${pct < 70 ? 'text-[var(--color-danger)]' : ''}`}>{pct}%</div>
                  <div className="font-mono text-xs text-[var(--color-muted)]">{missed.length === 0 ? '—' : missed.join(', ')}</div>
                </div>
              )
            })}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => exportResultsCsv(assessment.title, section?.label ?? '', students, results)}
          disabled={results.length === 0}
          className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={handleSendToLab}
          disabled={results.length === 0 || sendingToLab}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-50"
        >
          {sendingToLab ? 'Sending…' : '→ Send to the Lab'}
        </button>
      </div>

      {reviewing && (
        <FlaggedAnswersModal
          result={reviewing}
          assessment={assessment}
          studentName={students.find(s => s.id === reviewing.studentId)?.name ?? reviewing.studentId}
          userId={user.uid}
          onClose={() => setReviewing(null)}
          onSaved={handleReviewSaved}
        />
      )}

      {assigning && (
        <AssignUnmatchedModal
          sheet={assigning}
          students={students}
          existingStudentIds={new Set(results.map(r => r.studentId))}
          userId={user.uid}
          onClose={() => setAssigning(null)}
          onSaved={handleAssignSaved}
        />
      )}
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'gold' }) {
  return (
    <div className="flex-1 min-w-[120px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`font-mono text-2xl font-bold mt-0.5 ${tone === 'gold' ? 'text-[var(--color-gold)]' : 'text-[var(--color-text)]'}`}>{value}</div>
    </div>
  )
}

function AssignUnmatchedModal({
  sheet, students, existingStudentIds, userId, onClose, onSaved,
}: {
  sheet: RedPenUnmatchedSheet
  students: RedPenStudent[]
  existingStudentIds: Set<string>
  userId: string
  onClose: () => void
  onSaved: (result: RedPenResult) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = students
    .filter(s => !existingStudentIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  async function handlePick(studentId: string) {
    setSaving(true)
    setError(null)
    try {
      const result: RedPenResult = {
        studentId, administrationId: sheet.administrationId, score: sheet.score, maxScore: sheet.maxScore,
        responses: sheet.responses, flagged: sheet.logEntries.length > 0, logEntries: sheet.logEntries,
      }
      await saveResult(userId, result)
      await deleteUnmatchedSheet(sheet.id)
      onSaved(result)
    } catch {
      setError("Couldn't assign this sheet. Try again.")
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign page ${sheet.page}`}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">{sheet.reason}</p>
        <p className="text-xs text-[var(--color-muted)]">
          Scores <span className="font-mono text-[var(--color-text)]">{sheet.score} / {sheet.maxScore}</span> once assigned — no rescan needed.
        </p>
        {available.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)]">Every student in this section already has a result for this assessment.</div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {available.map(s => (
              <button
                key={s.id}
                disabled={saving}
                onClick={() => handlePick(s.id)}
                className="w-full text-left px-4 py-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors text-sm font-medium text-[var(--color-text)] disabled:opacity-50"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

function toCsvValue(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportResultsCsv(title: string, sectionLabel: string, students: RedPenStudent[], results: RedPenResult[]) {
  const rows = [
    ['Student', 'Score', 'Max score', 'Percent', 'Missed'],
    ...results
      .slice()
      .sort((a, b) => (students.find(s => s.id === a.studentId)?.name ?? '').localeCompare(students.find(s => s.id === b.studentId)?.name ?? ''))
      .map(r => {
        const student = students.find(s => s.id === r.studentId)
        const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0
        const missed = r.responses.filter(resp => !resp.correct).map(resp => resp.n)
        return [student?.name ?? r.studentId, r.score, r.maxScore, `${pct}%`, missed.join('; ')]
      }),
  ]
  const csv = rows.map(row => row.map(toCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'results').replace(/[\\/:*?"<>|]+/g, '').trim()}${sectionLabel ? ` - ${sectionLabel}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
