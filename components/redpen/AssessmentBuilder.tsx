'use client'

import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAuth } from '@/components/auth/AuthProvider'
import { MAX_QUESTIONS_PER_SHEET } from '@/lib/redpen/geometry'
import { getAssessment, saveAssessment } from '@/lib/redpen/storage'
import { AnswerEntry, RedPenAssessment, UnscorableEntry } from '@/lib/redpen/types'
import { ParsedMarksheet } from '@/lib/redpen/schema'
import { RedPenError, RedPenLoading } from './RedPenStatus'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * Where the builder's initial content comes from: editing an existing saved assessment,
 * prefilled from a successful import, or (draft === null in RedPenHub) a blank manual build.
 */
export type BuilderDraft = { assessmentId: string } | { parsed: ParsedMarksheet }

interface AssessmentBuilderProps {
  draft: BuilderDraft | null
  onSaved: () => void
}

interface Initial {
  id: string | null
  title: string
  questionCount: number
  choiceCount: number
  key: Record<number, AnswerEntry>
  unscorable: UnscorableEntry[]
  createdAt: string | null
}

function draftToInitial(draft: { parsed: ParsedMarksheet } | null): Initial {
  if (draft) {
    const { parsed } = draft
    const key: Record<number, AnswerEntry> = {}
    parsed.questions.forEach(entry => { key[entry.n] = entry })
    const maxN = Math.max(1, ...parsed.questions.map(q => q.n))
    return {
      id: null, title: parsed.title, questionCount: maxN, choiceCount: parsed.choiceCount,
      key, unscorable: parsed.unscorable, createdAt: null,
    }
  }
  return { id: null, title: '', questionCount: 25, choiceCount: 5, key: {}, unscorable: [], createdAt: null }
}

function assessmentToInitial(existing: RedPenAssessment): Initial {
  const key: Record<number, AnswerEntry> = {}
  existing.answerKey.forEach(entry => { key[entry.n] = entry })
  return {
    id: existing.id, title: existing.title, questionCount: existing.questionCount,
    choiceCount: existing.choiceCount, key, unscorable: existing.unscorable, createdAt: existing.createdAt,
  }
}

/** Loads the "editing an existing assessment" case, which is the only one needing an async
 *  fetch — the blank and imported-draft cases have everything in memory already. Renders the
 *  form only once `initial` data actually exists, so the form's own useState initializers never
 *  see stale/blank data get replaced out from under them after the fetch resolves. */
export function AssessmentBuilder({ draft, onSaved }: AssessmentBuilderProps) {
  const isEditingExisting = !!draft && 'assessmentId' in draft
  const [loading, setLoading] = useState(isEditingExisting)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState<Initial | null>(null)

  useEffect(() => {
    if (!draft || !('assessmentId' in draft)) return
    let cancelled = false
    getAssessment(draft.assessmentId)
      .then(existing => {
        if (cancelled) return
        if (!existing) { setError("Couldn't find that assessment."); return }
        setFetched(assessmentToInitial(existing))
      })
      .catch(() => { if (!cancelled) setError("Couldn't load that assessment. Try again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [draft])

  if (loading) return <RedPenLoading />
  if (error) return <RedPenError message={error} />

  const initial = isEditingExisting ? fetched! : draftToInitial(draft && 'parsed' in draft ? draft : null)
  return <AssessmentBuilderForm initial={initial} onSaved={onSaved} />
}

/** A question whose imported answer isn't a single MC letter (array, or grid-in) isn't editable
 *  in this phase's click-to-set bubble grid — spec §06 defers grid-in UI to phase two. Its
 *  imported entry is preserved as-is and shown as a locked badge instead of bubbles. */
function isSimpleMc(entry: AnswerEntry | undefined): entry is AnswerEntry & { answer: string } {
  return !!entry && entry.type !== 'gridin' && typeof entry.answer === 'string'
}

function AssessmentBuilderForm({ initial, onSaved }: { initial: Initial; onSaved: () => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState(initial.title)
  // Clamped even on load, not just going forward — a sheet already saved above today's max
  // (from before this limit existed) would otherwise stay silently broken to print.
  const initialQuestionCount = Math.min(initial.questionCount, MAX_QUESTIONS_PER_SHEET)
  const [questionCount, setQuestionCount] = useState(initialQuestionCount)
  // The stepper only moves in 5s, which can't ever land on e.g. 23 — this is the typed field
  // alongside it, kept as its own string state so the box can go through an empty/partial state
  // ("2" while typing "23") without that briefly collapsing the bubble grid to a clamped count.
  const [questionCountInput, setQuestionCountInput] = useState(String(initialQuestionCount))
  const [choiceCount, setChoiceCount] = useState(initial.choiceCount)
  const [key, setKey] = useState<Record<number, AnswerEntry>>(initial.key)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const letters = LETTERS.slice(0, choiceCount)
  // Locked/imported non-MC entries (array answers, grid-ins) always count as "answered" —
  // they came from a validated import, not from clicking a bubble.
  const totalAnswered = Array.from({ length: questionCount }, (_, i) => i + 1)
    .filter(n => key[n] !== undefined).length
  const keyPct = questionCount > 0 ? Math.round((totalAnswered / questionCount) * 100) : 0

  /** Sets both the real count and the field's text together — used by the +/- buttons so the
   *  typed field never drifts out of sync with what they set. */
  function setQuestionCountClamped(n: number) {
    const clamped = Math.max(5, Math.min(MAX_QUESTIONS_PER_SHEET, n))
    setQuestionCount(clamped)
    setQuestionCountInput(String(clamped))
  }

  function pick(n: number, letter: string) {
    setKey(prev => {
      const current = prev[n]
      if (isSimpleMc(current) && current.answer === letter) {
        const next = { ...prev }
        delete next[n]
        return next
      }
      return { ...prev, [n]: { n, answer: letter, points: current?.points ?? 1, type: 'mc' } }
    })
  }

  async function handleSave() {
    if (!user) return
    const assessment: RedPenAssessment = {
      id: initial.id ?? uuid(),
      title: title.trim() || 'Untitled assessment',
      questionCount,
      choiceCount,
      answerKey: Object.values(key).filter(e => e.n <= questionCount).sort((a, b) => a.n - b.n),
      unscorable: initial.unscorable,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    }
    try {
      await saveAssessment(user.uid, assessment)
      setSaved(true)
      setTimeout(onSaved, 500)
    } catch {
      setSaveError("Couldn't save — try again.")
    }
  }

  const half = Math.ceil(questionCount / 2)
  const colA = Array.from({ length: half }, (_, i) => i + 1)
  const colB = Array.from({ length: questionCount - half }, (_, i) => i + half + 1)

  function renderRow(n: number) {
    const entry = key[n]
    return (
      <div key={n} className={`flex items-center gap-3.5 px-2 py-1 rounded ${n % 5 === 0 ? 'bg-[var(--color-panel)]' : ''}`}>
        <div className="font-mono text-xs text-[var(--color-muted)] w-5 text-right">{String(n).padStart(2, '0')}</div>
        {isSimpleMc(entry) || entry === undefined ? (
          <div className="flex gap-1.5">
            {letters.map(letter => {
              const on = isSimpleMc(entry) && entry.answer === letter
              return (
                <button
                  key={letter}
                  onClick={() => pick(n, letter)}
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
          </div>
        ) : (
          <div className="font-mono text-xs px-2.5 py-1 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)]">
            {entry.type === 'gridin' ? `grid-in · ${entry.answer}` : Array.isArray(entry.answer) ? entry.answer.join(', ') : String(entry.answer)}
            {' '}(imported, locked)
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] block mb-1.5">
            Title
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Test 1 — Derivatives"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm font-medium"
          />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all whitespace-nowrap"
          >
            {saved ? 'Saved ✓' : 'Save assessment'}
          </button>
          {saveError && <div className="text-xs text-[var(--color-danger)]">{saveError}</div>}
        </div>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4.5 min-w-[200px]">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2.5">Questions</div>
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setQuestionCountClamped(questionCount - 5)}
              className="w-8 h-8 rounded border border-[var(--color-border)] text-lg text-[var(--color-text)]"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={questionCountInput}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
                setQuestionCountInput(digits)
                // Live-update the real count as digits come in — but only clamp the max here;
                // clamping the min too would snap "1" (of someone typing "15") straight to 5.
                if (digits !== '') setQuestionCount(Math.min(MAX_QUESTIONS_PER_SHEET, parseInt(digits, 10)))
              }}
              onBlur={() => setQuestionCountClamped(questionCountInput === '' ? questionCount : parseInt(questionCountInput, 10))}
              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
              className="font-mono text-2xl w-14 text-center tabular-nums bg-transparent border border-transparent rounded hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              onClick={() => setQuestionCountClamped(questionCount + 5)}
              className="w-8 h-8 rounded border border-[var(--color-border)] text-lg text-[var(--color-text)]"
            >
              +
            </button>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4.5">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2.5">
            Choices per question
          </div>
          <div className="flex gap-1.5">
            {[4, 5, 6, 7, 8].map(c => (
              <button
                key={c}
                onClick={() => setChoiceCount(c)}
                className={`font-mono text-xs px-3.5 py-2 rounded border transition-colors ${
                  c === choiceCount
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]'
                }`}
              >
                A–{LETTERS[c - 1]}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4.5 flex-1 flex flex-col justify-center min-w-[220px]">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2">Key progress</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[var(--color-panel)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--color-gold)]" style={{ width: `${keyPct}%` }} />
            </div>
            <div className="font-mono text-sm tabular-nums whitespace-nowrap">{totalAnswered} / {questionCount}</div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-0.5">
          <div className="flex flex-col gap-0.5">{colA.map(renderRow)}</div>
          <div className="flex flex-col gap-0.5">{colB.map(renderRow)}</div>
        </div>
      </div>
    </div>
  )
}
