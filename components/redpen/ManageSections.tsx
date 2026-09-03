'use client'

import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/components/auth/AuthProvider'
import { shortId } from '@/lib/redpen/id'
import { deleteSection, listSections, listStudents, saveSection, saveStudent, deleteStudent } from '@/lib/redpen/storage'
import { RedPenSection, RedPenStudent } from '@/lib/redpen/types'
import { RedPenError, RedPenLoading } from './RedPenStatus'

export function ManageSections() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sections, setSections] = useState<RedPenSection[]>([])
  const [students, setStudents] = useState<RedPenStudent[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [pastingRoster, setPastingRoster] = useState(false)
  const [rosterPaste, setRosterPaste] = useState('')
  const [renamingStudent, setRenamingStudent] = useState<RedPenStudent | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingSection, setDeletingSection] = useState<RedPenSection | null>(null)
  const [deletingSectionBusy, setDeletingSectionBusy] = useState(false)

  async function refresh(uid: string) {
    try {
      const [sec, stu] = await Promise.all([listSections(uid), listStudents(uid)])
      setSections(sec)
      setStudents(stu)
      setActiveSectionId(prev => prev ?? sec[0]?.id ?? null)
      setError(null)
    } catch {
      setError("Couldn't load your sections. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    refresh(user.uid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  if (!user) return <RedPenError message="Sign in to manage your sections." />
  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />

  async function handleAddSection() {
    const label = newSectionLabel.trim()
    if (!label || !user) return
    const section: RedPenSection = { id: uuid(), label }
    await saveSection(user.uid, section)
    setNewSectionLabel('')
    setAddingSection(false)
    await refresh(user.uid)
    setActiveSectionId(section.id)
  }

  async function handleAddStudent() {
    if (!activeSectionId || !user) return
    const name = newStudentName.trim()
    if (!name) return
    // short — encoded in every printed sheet's QR
    await saveStudent(user.uid, { id: shortId(), sectionId: activeSectionId, name })
    setNewStudentName('')
    setAddingStudent(false)
    await refresh(user.uid)
  }

  async function handleDeleteStudent(id: string) {
    if (!user) return
    await deleteStudent(id)
    await refresh(user.uid)
  }

  /** One name per line, blank lines ignored — the fast path for a real ~30-student roster
   *  instead of the one-at-a-time modal. */
  async function handlePasteRoster() {
    if (!activeSectionId || !user) return
    const names = rosterPaste.split('\n').map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    // short — encoded in every printed sheet's QR, see id.ts
    await Promise.all(names.map(name => saveStudent(user.uid, { id: shortId(), sectionId: activeSectionId, name })))
    setRosterPaste('')
    setPastingRoster(false)
    await refresh(user.uid)
  }

  /** Keeps the student's existing id — unlike delete-and-re-add, this doesn't orphan an
   *  already-printed sheet (the id is what's encoded in that student's QR code). */
  async function handleRenameStudent() {
    if (!user || !renamingStudent) return
    const name = renameValue.trim()
    if (!name) return
    await saveStudent(user.uid, { ...renamingStudent, name })
    setRenamingStudent(null)
    await refresh(user.uid)
  }

  async function handleConfirmDeleteSection() {
    if (!user || !deletingSection) return
    setDeletingSectionBusy(true)
    try {
      await deleteSection(user.uid, deletingSection.id)
      if (activeSectionId === deletingSection.id) setActiveSectionId(null)
      setDeletingSection(null)
      await refresh(user.uid)
    } finally {
      setDeletingSectionBusy(false)
    }
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
            <div
              key={sec.id}
              className={`flex items-center gap-1 pl-4 pr-1.5 py-1 rounded-md border whitespace-nowrap ${
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
              }`}
            >
              <button onClick={() => setActiveSectionId(sec.id)} className="font-mono text-xs py-1">
                {sec.label} · <span className="tabular-nums">{count}</span>
              </button>
              <button
                onClick={() => setDeletingSection(sec)}
                title="Delete section"
                className="p-1.5 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setRenamingStudent(st); setRenameValue(st.name) }}
                    className="text-xs text-[var(--color-muted)] hover:underline"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteStudent(st.id)}
                    className="text-xs text-[var(--color-danger)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="px-6 py-3 flex items-center gap-4">
            <button
              onClick={() => setAddingStudent(true)}
              className="text-sm font-medium text-[var(--color-gold-text)] hover:underline"
            >
              + Add student
            </button>
            <button
              onClick={() => setPastingRoster(true)}
              className="text-sm font-medium text-[var(--color-muted)] hover:underline"
            >
              + Paste a list
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

      <Modal open={pastingRoster} onClose={() => setPastingRoster(false)} title="Paste a list">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">One name per line.</p>
          <textarea
            autoFocus
            value={rosterPaste}
            onChange={e => setRosterPaste(e.target.value)}
            placeholder={'Avery Nakamura\nBenji Ortiz\nCora Lindqvist'}
            className="w-full min-h-[180px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm resize-y"
          />
          <button
            onClick={handlePasteRoster}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Add {rosterPaste.split('\n').map(n => n.trim()).filter(Boolean).length} student{rosterPaste.split('\n').map(n => n.trim()).filter(Boolean).length === 1 ? '' : 's'}
          </button>
        </div>
      </Modal>

      <Modal open={renamingStudent !== null} onClose={() => setRenamingStudent(null)} title="Rename student">
        <div className="space-y-4">
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRenameStudent()}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm"
          />
          <button
            onClick={handleRenameStudent}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal open={deletingSection !== null} onClose={() => setDeletingSection(null)} title="Delete section?">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            This removes <span className="font-medium text-[var(--color-text)]">{deletingSection?.label}</span>{' '}
            and its whole roster — plus any sheets, scans, and results already recorded for this section. Assessments
            themselves (and any other sections they were given to) aren&apos;t affected. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeletingSection(null)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteSection}
              disabled={deletingSectionBusy}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-danger)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
            >
              {deletingSectionBusy ? 'Deleting…' : 'Delete section'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
