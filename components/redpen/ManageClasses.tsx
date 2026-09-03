'use client'

import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Modal } from '@/components/ui/Modal'
import { shortId } from '@/lib/redpen/id'
import { listSections, listStudents, saveSection, saveStudent, deleteStudent } from '@/lib/redpen/storage'
import { RedPenSection, RedPenStudent } from '@/lib/redpen/types'

export function ManageClasses() {
  const [sections, setSections] = useState<RedPenSection[]>(() => listSections())
  const [students, setStudents] = useState<RedPenStudent[]>(() => listStudents())
  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => listSections()[0]?.id ?? null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')

  function refresh() {
    const sec = listSections()
    setSections(sec)
    setStudents(listStudents())
    setActiveSectionId(prev => prev ?? sec[0]?.id ?? null)
  }

  function handleAddSection() {
    const label = newSectionLabel.trim()
    if (!label) return
    const section: RedPenSection = { id: uuid(), label }
    saveSection(section)
    setNewSectionLabel('')
    setAddingSection(false)
    refresh()
    setActiveSectionId(section.id)
  }

  function handleAddStudent() {
    if (!activeSectionId) return
    const name = newStudentName.trim()
    if (!name) return
    saveStudent({ id: shortId(), sectionId: activeSectionId, name }) // short — encoded in every printed sheet's QR
    setNewStudentName('')
    setAddingStudent(false)
    refresh()
  }

  const rosterForSection = students.filter(s => s.sectionId === activeSectionId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Roster</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Students, entered once per section. Each student keeps the same ID across every assessment — it&apos;s
          what links a scanned sheet back to them.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {sections.map(sec => {
          const count = students.filter(s => s.sectionId === sec.id).length
          const active = sec.id === activeSectionId
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSectionId(sec.id)}
              className={`font-mono text-xs px-4 py-2 rounded-md border transition-colors whitespace-nowrap ${
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
              }`}
            >
              {sec.label} · <span className="tabular-nums">{count}</span>
            </button>
          )
        })}
        <button
          onClick={() => setAddingSection(true)}
          className="text-sm px-4 py-2 rounded-md border border-dashed border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          + New section
        </button>
      </div>

      {sections.length === 0 && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-4">
          No sections yet — add one to start building a roster.
        </div>
      )}

      {activeSectionId && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-4 px-6 py-3 border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            <div>Name</div>
            <div>Sheet code</div>
          </div>
          {rosterForSection.map(st => (
            <div
              key={st.id}
              className="grid grid-cols-[minmax(0,1fr)_160px] gap-4 items-center px-6 py-3 border-b border-[var(--color-border)] last:border-b-0"
            >
              <div className="text-sm font-medium text-[var(--color-text)]">{st.name}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[var(--color-muted)]">auto per test</span>
                <button
                  onClick={() => { deleteStudent(st.id); refresh() }}
                  className="text-xs text-[var(--color-danger)] hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="px-6 py-3">
            <button
              onClick={() => setAddingStudent(true)}
              className="text-sm font-medium text-[var(--color-gold-text)] hover:underline"
            >
              + Add student
            </button>
          </div>
        </div>
      )}

      <Modal open={addingSection} onClose={() => setAddingSection(false)} title="New section">
        <div className="space-y-4">
          <input
            autoFocus
            value={newSectionLabel}
            onChange={e => setNewSectionLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSection()}
            placeholder="e.g. Period 3"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm"
          />
          <button
            onClick={handleAddSection}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Add section
          </button>
        </div>
      </Modal>

      <Modal open={addingStudent} onClose={() => setAddingStudent(false)} title="Add student">
        <div className="space-y-4">
          <input
            autoFocus
            value={newStudentName}
            onChange={e => setNewStudentName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
            placeholder="Student name"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm"
          />
          <button
            onClick={handleAddStudent}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Add student
          </button>
        </div>
      </Modal>
    </div>
  )
}
