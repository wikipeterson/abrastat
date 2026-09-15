'use client'

// Lets a teacher actually see and act on why a student's sheet got flagged, instead of just a
// gold dot with no way in — every RedPenResult already carries the exact fill percentages and
// reasoning the scan produced (lib/redpen/decide.ts's DecisionLogEntry.detail), it just wasn't
// surfaced anywhere until now. Opening this and hitting Save always clears the reviewed flags —
// whether or not any letter was actually changed — since reaching Save means a human looked at
// the numbers and either corrected the answer or agreed with what the scan already had.

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { LETTERS } from '@/lib/redpen/letters'
import { scoreAssessment } from '@/lib/redpen/scoring'
import { saveResult } from '@/lib/redpen/storage'
import { AnswerValue, DecisionLogEntry, RedPenAssessment, RedPenResult } from '@/lib/redpen/types'

const TAG_STYLE: Record<string, string> = {
  FAINT: 'bg-[var(--color-gold-light)] text-[var(--color-gold-text)]',
  DOUBLE: 'bg-[var(--color-gold-light)] text-[var(--color-gold-text)]',
  ERASURE: 'bg-[var(--color-gold-light)] text-[var(--color-gold-text)]',
  NO_MARK: 'bg-[var(--color-danger-light)] text-[var(--color-danger)]',
}

interface FlaggedAnswersModalProps {
  result: RedPenResult
  assessment: RedPenAssessment
  studentName: string
  userId: string
  onClose: () => void
  onSaved: (updated: RedPenResult) => void
}

export function FlaggedAnswersModal({ result, assessment, studentName, userId, onClose, onSaved }: FlaggedAnswersModalProps) {
  // Only question-level entries ever reach a saved RedPenResult (a sheet-level failure like
  // NO_QR never produces one at all), but filter defensively rather than assume.
  const entries = (result.logEntries ?? []).filter((e): e is DecisionLogEntry & { n: number } => e.n !== undefined)
  const responseByN = new Map(result.responses.map(r => [r.n, r]))

  const [overrides, setOverrides] = useState<Record<number, AnswerValue | null>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function valueFor(n: number): AnswerValue | null {
    return n in overrides ? overrides[n] : (responseByN.get(n)?.given ?? null)
  }

  function pickSingle(n: number, letter: string) {
    const current = valueFor(n)
    setOverrides(prev => ({ ...prev, [n]: current === letter ? null : letter }))
  }

  function toggleMulti(n: number, letter: string) {
    const current = valueFor(n)
    const set = new Set(Array.isArray(current) ? current : [])
    if (set.has(letter)) set.delete(letter)
    else set.add(letter)
    setOverrides(prev => ({ ...prev, [n]: set.size > 0 ? [...set] : null }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const given = new Map<number, AnswerValue | null>(result.responses.map(r => [r.n, r.given]))
      for (const n of Object.keys(overrides).map(Number)) given.set(n, overrides[n])

      const { score, maxScore, responses } = scoreAssessment(assessment, given)
      const reviewed = new Set(entries.map(e => e.n))
      const logEntries = (result.logEntries ?? []).filter(e => e.n === undefined || !reviewed.has(e.n))

      const updated: RedPenResult = { ...result, score, maxScore, responses, logEntries, flagged: logEntries.length > 0 }
      await saveResult(userId, updated)
      onSaved(updated)
    } catch {
      setError("Couldn't save your changes. Try again.")
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Review flagged answers — ${studentName}`} width="max-w-2xl">
      <div className="space-y-5">
        <p className="text-sm text-[var(--color-muted)]">
          These questions needed a judgment call during scanning. Pick a different letter to correct one, or leave it
          as-is if the reading looks right — either way, saving clears them from &quot;needs a second look.&quot;
        </p>

        <div className="space-y-4">
          {entries.map(entry => {
            const key = assessment.answerKey.find(k => k.n === entry.n)
            const letters = LETTERS.slice(0, assessment.choiceCount)
            const isMulti = Array.isArray(key?.answer)
            const value = valueFor(entry.n)
            const selected = new Set(Array.isArray(value) ? value : value ? [value] : [])

            return (
              <div key={entry.n} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[var(--color-panel)] border-b border-[var(--color-border)]">
                  <span className="font-mono text-xs font-semibold text-[var(--color-text)]">Q{entry.n}</span>
                  <span className={`font-mono text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${TAG_STYLE[entry.tag] ?? 'bg-[var(--color-panel)] text-[var(--color-muted)]'}`}>
                    {entry.tag}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">{entry.detail}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {letters.map(letter => {
                      const on = selected.has(letter)
                      return (
                        <button
                          key={letter}
                          onClick={() => (isMulti ? toggleMulti(entry.n, letter) : pickSingle(entry.n, letter))}
                          className={`w-7 h-7 rounded-full border font-mono text-xs flex items-center justify-center transition-colors ${
                            on
                              ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                              : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]'
                          }`}
                        >
                          {letter}
                        </button>
                      )
                    })}
                    {selected.size === 0 && (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] ml-1">blank</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save & clear flags'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
