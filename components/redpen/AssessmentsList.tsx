'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/components/auth/AuthProvider'
import {
  createAdministration, deleteAssessment, listAdministrations, listAssessments, listResults,
  listSections, listStudents,
} from '@/lib/redpen/storage'
import {
  AdministrationStatus, RedPenAdministration, RedPenAssessment, RedPenResult, RedPenSection, RedPenStudent,
} from '@/lib/redpen/types'
import { RedPenError, RedPenLoading } from './RedPenStatus'

export type AdministrationScreen = 'sheets' | 'scan' | 'results'

interface AssessmentsListProps {
  onNewAssessment: () => void
  onOpenAdministration: (administrationId: string, screen: AdministrationScreen) => void
  onEditAssessment: (assessmentId: string) => void
}

const STATUS_LABEL: Record<AdministrationStatus, string> = {
  'sheets-ready': 'sheets ready',
  printed: 'ready to scan',
  graded: 'graded',
}
const STATUS_STYLE: Record<AdministrationStatus, string> = {
  'sheets-ready': 'bg-[var(--color-panel)] text-[var(--color-muted)]',
  printed: 'bg-[var(--color-gold-light)] text-[var(--color-gold-text)]',
  graded: 'bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]',
}
// Which screen each status's own "next step" is — used only to bold that one link; every
// administration can jump to any of the three regardless of status (reprinting, a late
// student's makeup scan, or rechecking results are all normal, not just "the next step").
const CURRENT_SCREEN: Record<AdministrationStatus, AdministrationScreen> = {
  'sheets-ready': 'sheets', printed: 'scan', graded: 'results',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase()
}

/** Assessments sharing a versionGroupId *are* the versions of one multi-version assessment —
 *  grouped into one card each, sorted so Version A (or an unlabeled single-version assessment)
 *  leads. An assessment with no versionGroupId is its own singleton group, same as today. */
interface AssessmentGroup {
  key: string
  members: RedPenAssessment[]
}

function groupAssessments(assessments: RedPenAssessment[]): AssessmentGroup[] {
  const map = new Map<string, RedPenAssessment[]>()
  for (const a of assessments) {
    const key = a.versionGroupId ?? a.id
    map.set(key, [...(map.get(key) ?? []), a])
  }
  return [...map.entries()]
    .map(([key, members]) => ({
      key, members: members.slice().sort((x, y) => (x.versionLabel ?? '').localeCompare(y.versionLabel ?? '')),
    }))
    .sort((a, b) => (b.members[0]?.createdAt ?? '').localeCompare(a.members[0]?.createdAt ?? ''))
}

export function AssessmentsList({ onNewAssessment, onOpenAdministration, onEditAssessment }: AssessmentsListProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assessments, setAssessments] = useState<RedPenAssessment[]>([])
  const [administrations, setAdministrations] = useState<RedPenAdministration[]>([])
  const [sections, setSections] = useState<RedPenSection[]>([])
  const [students, setStudents] = useState<RedPenStudent[]>([])
  const [results, setResults] = useState<RedPenResult[]>([])
  const [givingToSectionFor, setGivingToSectionFor] = useState<AssessmentGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<AssessmentGroup | null>(null)
  const [deletingGroupBusy, setDeletingGroupBusy] = useState(false)

  async function refresh(uid: string) {
    try {
      const [a, admins, sec, stu, res] = await Promise.all([
        listAssessments(uid), listAdministrations(uid), listSections(uid), listStudents(uid), listResults(uid),
      ])
      setAssessments(a)
      setAdministrations(admins)
      setSections(sec)
      setStudents(stu)
      setResults(res)
      setError(null)
    } catch {
      setError("Couldn't load your assessments. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    refresh(user.uid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  if (!user) return <RedPenError message="Sign in to see your assessments." />
  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />

  async function handleGiveToSection(primaryAssessmentId: string, sectionId: string) {
    if (!user) return
    await createAdministration(user.uid, primaryAssessmentId, sectionId)
    setGivingToSectionFor(null)
    await refresh(user.uid)
  }

  async function handleConfirmDeleteGroup() {
    if (!user || !deletingGroup) return
    setDeletingGroupBusy(true)
    try {
      // Version A's own delete cleans up every administration/result/unmatched-sheet for the
      // group (they're all found via the primary's assessmentId — see storage.ts); a sibling
      // version's delete finds nothing referencing it directly and just removes its own doc.
      for (const a of deletingGroup.members) await deleteAssessment(user.uid, a.id)
      setDeletingGroup(null)
      await refresh(user.uid)
    } finally {
      setDeletingGroupBusy(false)
    }
  }

  const studentCountBySection = (sectionId: string) => students.filter(s => s.sectionId === sectionId).length
  const groups = groupAssessments(assessments)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Assessments</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Scan to grade bubble sheets. {groups.length} assessment{groups.length === 1 ? '' : 's'} on file.
          </p>
        </div>
        <button
          onClick={onNewAssessment}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all whitespace-nowrap"
        >
          New assessment
        </button>
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          No assessments yet. Import one from Claude or build one by hand to get started.
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {groups.map(group => {
          const primary = group.members[0]
          const multi = group.members.length > 1
          const admins = administrations.filter(admin => admin.assessmentId === primary.id)
          const availableSections = sections.filter(s => !admins.some(admin => admin.sectionId === s.id))
          return (
            <div key={group.key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex justify-between items-baseline mb-3.5 gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-[var(--color-text)]">{primary.title}</div>
                    {multi && (
                      <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)]">
                        A/B
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">
                    <span className="font-mono">{primary.questionCount}</span> questions · created{' '}
                    <span className="font-mono">{formatDate(primary.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {multi ? (
                    group.members.map(m => (
                      <button
                        key={m.id}
                        onClick={() => onEditAssessment(m.id)}
                        className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline"
                      >
                        Edit key {m.versionLabel ?? '?'}
                      </button>
                    ))
                  ) : (
                    <button onClick={() => onEditAssessment(primary.id)} className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline">
                      Edit key
                    </button>
                  )}
                  <button
                    onClick={() => setGivingToSectionFor(group)}
                    disabled={availableSections.length === 0}
                    className="font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Give to a section
                  </button>
                  <button
                    onClick={() => setDeletingGroup(group)}
                    title={multi ? 'Delete both versions' : 'Delete assessment'}
                    className="p-1.5 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {admins.length === 0 ? (
                <div className="text-sm text-[var(--color-muted)]">
                  Not given to a section yet — use &quot;Give to a section&quot; above once your roster is ready.
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {admins.map(admin => {
                    const section = sections.find(s => s.id === admin.sectionId)
                    const current = CURRENT_SCREEN[admin.status]
                    const links: { screen: AdministrationScreen; label: string }[] = [
                      { screen: 'sheets', label: 'Answer Sheets' },
                      { screen: 'scan', label: 'Scan' },
                      { screen: 'results', label: 'Results' },
                    ]
                    const rosterCount = section ? studentCountBySection(section.id) : 0
                    const resultsCount = results.filter(r => r.administrationId === admin.id).length
                    const statusLabel = admin.status === 'graded' && resultsCount < rosterCount
                      ? `graded ${resultsCount}/${rosterCount}`
                      : STATUS_LABEL[admin.status]
                    return (
                      <div
                        key={admin.id}
                        className="grid grid-cols-[120px_110px_1fr_auto] gap-4 items-center px-2.5 py-2.5 rounded border-t border-[var(--color-panel)]"
                      >
                        <div className="text-sm font-medium text-[var(--color-text)]">{section?.label ?? '—'}</div>
                        <div className={`font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded w-fit ${STATUS_STYLE[admin.status]}`}>
                          {statusLabel}
                        </div>
                        <div className="font-mono text-xs text-[var(--color-muted)] text-right">
                          {section ? `${studentCountBySection(section.id)} students` : ''}
                        </div>
                        <div className="flex items-center gap-3">
                          {links.map(link => (
                            <button
                              key={link.screen}
                              onClick={() => onOpenAdministration(admin.id, link.screen)}
                              className={`text-xs hover:underline ${
                                link.screen === current
                                  ? 'font-semibold text-[var(--color-accent-strong)]'
                                  : 'text-[var(--color-muted)]'
                              }`}
                            >
                              {link.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal open={givingToSectionFor !== null} onClose={() => setGivingToSectionFor(null)} title="Give to a section">
        <div className="space-y-2">
          {sections.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">
              No sections yet — add one under Manage Sections first.
            </div>
          )}
          {sections
            .filter(s => givingToSectionFor && !administrations.some(admin => admin.assessmentId === givingToSectionFor.members[0].id && admin.sectionId === s.id))
            .map(s => (
              <button
                key={s.id}
                onClick={() => givingToSectionFor && handleGiveToSection(givingToSectionFor.members[0].id, s.id)}
                className="w-full text-left px-4 py-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors flex items-center justify-between"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{s.label}</span>
                <span className="font-mono text-xs text-[var(--color-muted)]">{studentCountBySection(s.id)} students</span>
              </button>
            ))}
        </div>
      </Modal>

      <Modal open={deletingGroup !== null} onClose={() => setDeletingGroup(null)} title={deletingGroup && deletingGroup.members.length > 1 ? 'Delete both versions?' : 'Delete assessment?'}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            This removes <span className="font-medium text-[var(--color-text)]">{deletingGroup?.members[0].title}</span>
            {deletingGroup && deletingGroup.members.length > 1 && ' (both versions)'} and every section it was given to
            — including their printed-sheet status, scans, and results. Your class rosters themselves aren&apos;t
            affected. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeletingGroup(null)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteGroup}
              disabled={deletingGroupBusy}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-danger)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
            >
              {deletingGroupBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
