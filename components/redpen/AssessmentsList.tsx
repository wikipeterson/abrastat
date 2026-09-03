'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  createAdministration, listAdministrations, listAssessments, listSections, listStudents,
} from '@/lib/redpen/storage'
import { AdministrationStatus, RedPenAdministration, RedPenAssessment, RedPenSection } from '@/lib/redpen/types'

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

export function AssessmentsList({ onNewAssessment, onOpenAdministration, onEditAssessment }: AssessmentsListProps) {
  const [assessments, setAssessments] = useState<RedPenAssessment[]>(() => listAssessments())
  const [administrations, setAdministrations] = useState<RedPenAdministration[]>(() => listAdministrations())
  const [sections, setSections] = useState<RedPenSection[]>(() => listSections())
  const [givingToClassFor, setGivingToClassFor] = useState<string | null>(null)

  function refresh() {
    setAssessments(listAssessments())
    setAdministrations(listAdministrations())
    setSections(listSections())
  }

  function handleGiveToClass(assessmentId: string, sectionId: string) {
    createAdministration(assessmentId, sectionId)
    setGivingToClassFor(null)
    refresh()
  }

  const studentCountBySection = (sectionId: string) => listStudents(sectionId).length

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Assessments</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Scan and grade bubble sheets. {assessments.length} assessment{assessments.length === 1 ? '' : 's'} on file.
          </p>
        </div>
        <button
          onClick={onNewAssessment}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-125 transition-all whitespace-nowrap"
        >
          New assessment
        </button>
      </div>

      {assessments.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-6 text-center">
          No assessments yet. Import one from Claude or build one by hand to get started.
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {assessments.map(a => {
          const admins = administrations.filter(admin => admin.assessmentId === a.id)
          const availableSections = sections.filter(s => !admins.some(admin => admin.sectionId === s.id))
          return (
            <div key={a.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex justify-between items-baseline mb-3.5 gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-semibold text-[var(--color-text)]">{a.title}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">
                    <span className="font-mono">{a.questionCount}</span> questions · created{' '}
                    <span className="font-mono">{formatDate(a.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => onEditAssessment(a.id)} className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline">
                    Edit key
                  </button>
                  <button
                    onClick={() => setGivingToClassFor(a.id)}
                    disabled={availableSections.length === 0}
                    className="font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded border border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Give to another class
                  </button>
                </div>
              </div>

              {admins.length === 0 ? (
                <div className="text-sm text-[var(--color-muted)]">
                  Not given to a class yet — use &quot;Give to another class&quot; above once your roster is ready.
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {admins.map(admin => {
                    const section = sections.find(s => s.id === admin.sectionId)
                    const current = CURRENT_SCREEN[admin.status]
                    const links: { screen: AdministrationScreen; label: string }[] = [
                      { screen: 'sheets', label: 'Sheets' },
                      { screen: 'scan', label: 'Scan' },
                      { screen: 'results', label: 'Results' },
                    ]
                    return (
                      <div
                        key={admin.id}
                        className="grid grid-cols-[120px_110px_1fr_auto] gap-4 items-center px-2.5 py-2.5 rounded border-t border-[var(--color-panel)]"
                      >
                        <div className="text-sm font-medium text-[var(--color-text)]">{section?.label ?? '—'}</div>
                        <div className={`font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded w-fit ${STATUS_STYLE[admin.status]}`}>
                          {STATUS_LABEL[admin.status]}
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

      <Modal open={givingToClassFor !== null} onClose={() => setGivingToClassFor(null)} title="Give to a class">
        <div className="space-y-2">
          {sections.length === 0 && (
            <div className="text-sm text-[var(--color-muted)]">
              No sections yet — add one under Manage Classes first.
            </div>
          )}
          {sections
            .filter(s => givingToClassFor && !administrations.some(admin => admin.assessmentId === givingToClassFor && admin.sectionId === s.id))
            .map(s => (
              <button
                key={s.id}
                onClick={() => givingToClassFor && handleGiveToClass(givingToClassFor, s.id)}
                className="w-full text-left px-4 py-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors flex items-center justify-between"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{s.label}</span>
                <span className="font-mono text-xs text-[var(--color-muted)]">{studentCountBySection(s.id)} students</span>
              </button>
            ))}
        </div>
      </Modal>
    </div>
  )
}
