'use client'

import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAuth } from '@/components/auth/AuthProvider'
import { DEFAULT_GRIDIN_DIGITS, maxQuestionsPerSheet } from '@/lib/redpen/geometry'
import { LETTERS } from '@/lib/redpen/letters'
import { getAssessment, listAdministrations, listResults, saveAssessment, saveResult } from '@/lib/redpen/storage'
import { listVersionGroup, primaryOfGroup } from '@/lib/redpen/versions'
import { AnswerEntry, AnswerValue, RedPenAssessment, UnscorableEntry } from '@/lib/redpen/types'
import { ParsedMarksheet } from '@/lib/redpen/schema'
import { scoreAssessment } from '@/lib/redpen/scoring'
import { RedPenError, RedPenLoading } from './RedPenStatus'

/** Same shape schema.ts's import parser validates a grid-in answer against. */
const GRIDIN_ANSWER_RE = /^-?\d+(\.\d+)?$/
const GRIDIN_MIN_DIGITS = 1
const GRIDIN_MAX_DIGITS = 6

function gridinDigitsOf(entries: Record<number, AnswerEntry>): { count: number; maxDigits: number } {
  const gridinEntries = Object.values(entries).filter(e => e.type === 'gridin')
  return {
    count: gridinEntries.length,
    maxDigits: Math.max(0, ...gridinEntries.map(e => e.digits ?? DEFAULT_GRIDIN_DIGITS)),
  }
}

/**
 * Where the builder's initial content comes from: editing an existing saved assessment,
 * prefilled from a successful import, or (draft === null in RedPenHub) a blank manual build.
 */
export type BuilderDraft = { assessmentId: string } | { parsed: ParsedMarksheet }

interface AssessmentBuilderProps {
  draft: BuilderDraft | null
  onSaved: (assessment: RedPenAssessment) => void
  /** Set only when creating a version group (via NewAssessmentFlow.tsx) — folded into whatever
   *  gets saved. Absent when editing an existing assessment, which already carries its own
   *  versionGroupId/versionLabel through assessmentToInitial below. */
  versionGroupId?: string
  versionLabel?: string
  /** Prefills the title field for a fresh (non-import) Version B, defaulting to Version A's —
   *  editable, not enforced. */
  titleOverride?: string
}

interface Initial {
  id: string | null
  title: string
  questionCount: number
  choiceCount: number
  key: Record<number, AnswerEntry>
  unscorable: UnscorableEntry[]
  createdAt: string | null
  versionGroupId?: string
  versionLabel?: string
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
    versionGroupId: existing.versionGroupId, versionLabel: existing.versionLabel,
  }
}

/** Loads the "editing an existing assessment" case, which is the only one needing an async
 *  fetch — the blank and imported-draft cases have everything in memory already. Renders the
 *  form only once `initial` data actually exists, so the form's own useState initializers never
 *  see stale/blank data get replaced out from under them after the fetch resolves. */
export function AssessmentBuilder({ draft, onSaved, versionGroupId, versionLabel, titleOverride }: AssessmentBuilderProps) {
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

  const baseInitial = isEditingExisting ? fetched! : draftToInitial(draft && 'parsed' in draft ? draft : null)
  // Version props only ever apply to a fresh (non-editing) create — an existing assessment
  // already carries its own versionGroupId/versionLabel through assessmentToInitial above, and
  // those always win (a saved assessment's version identity doesn't change by being re-opened).
  const initial: Initial = {
    ...baseInitial,
    versionGroupId: baseInitial.versionGroupId ?? versionGroupId,
    versionLabel: baseInitial.versionLabel ?? versionLabel,
    title: baseInitial.title || titleOverride || baseInitial.title,
  }
  return <AssessmentBuilderForm initial={initial} onSaved={onSaved} />
}

/** A single MC letter, editable via the click-to-set bubble picker. */
function isSimpleMc(entry: AnswerEntry | undefined): entry is AnswerEntry & { answer: string } {
  return !!entry && entry.type !== 'gridin' && typeof entry.answer === 'string'
}

function isGridin(entry: AnswerEntry | undefined): entry is AnswerEntry & { type: 'gridin'; answer: string } {
  return !!entry && entry.type === 'gridin'
}

/** An imported multi-answer (array) question isn't editable in this builder — no UI here for
 *  picking more than one correct letter yet — so it's preserved as-is and shown as a locked
 *  badge instead of a picker. Anything else (MC, grid-in, or a blank row) is editable. */
function isLockedImport(entry: AnswerEntry | undefined): boolean {
  return !!entry && entry.type !== 'gridin' && Array.isArray(entry.answer)
}

function isAnswered(entry: AnswerEntry | undefined): boolean {
  if (!entry) return false
  if (isGridin(entry)) return typeof entry.answer === 'string' && entry.answer.trim() !== ''
  return true
}

function AssessmentBuilderForm({ initial, onSaved }: { initial: Initial; onSaved: (assessment: RedPenAssessment) => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState(initial.title)
  const [choiceCount, setChoiceCount] = useState(initial.choiceCount)
  const [key, setKey] = useState<Record<number, AnswerEntry>>(initial.key)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Set only when saving this key actually regraded existing results (a brand-new assessment, or
  // one with no administrations yet, has nothing to regrade) — shown next to the Saved
  // confirmation so a key fix visibly reaches sheets already scored, not just future scans.
  const [regradedCount, setRegradedCount] = useState<number | null>(null)
  // Set when this key's shape (question/choice counts, per-question type) doesn't match its
  // sibling version's — not a hard block (there might be a real reason), but the whole point of
  // the multi-version FORM bubble is that both versions share one printed shape, so a silent
  // mismatch here is the worst failure mode the feature has. Saving again while this is showing
  // goes through regardless.
  const [shapeWarning, setShapeWarning] = useState<string | null>(null)

  // The cap moves with the key itself — each grid-in question reserves space in its own band
  // below the MC grid, so adding/removing one changes how many questions fit on one page.
  const { count: gridinCount, maxDigits: gridinMaxDigits } = gridinDigitsOf(key)
  const questionCap = maxQuestionsPerSheet(gridinCount, gridinMaxDigits)

  // Clamped even on load, not just going forward — a sheet already saved above today's max
  // (from before this limit existed) would otherwise stay silently broken to print.
  const initialQuestionCount = Math.min(initial.questionCount, questionCap)
  const [questionCount, setQuestionCount] = useState(initialQuestionCount)
  // The stepper only moves in 5s, which can't ever land on e.g. 23 — this is the typed field
  // alongside it, kept as its own string state so the box can go through an empty/partial state
  // ("2" while typing "23") without that briefly collapsing the bubble grid to a clamped count.
  const [questionCountInput, setQuestionCountInput] = useState(String(initialQuestionCount))

  const letters = LETTERS.slice(0, choiceCount)
  const totalAnswered = Array.from({ length: questionCount }, (_, i) => i + 1)
    .filter(n => isAnswered(key[n])).length
  const keyPct = questionCount > 0 ? Math.round((totalAnswered / questionCount) * 100) : 0

  // Entries beyond the current question count only ever exist right after loading an import or
  // a previously-saved key that had more questions than this sheet's limit allows — ordinary
  // editing can't create one, since the stepper itself is clamped to questionCap. Surfaced as a
  // warning rather than silently dropped on save (handleSave already filters these out via
  // `e.n <= questionCount`), so a teacher sees exactly what got cut instead of finding out later.
  const droppedEntries = Object.values(key).filter(e => e.n > questionCount).sort((a, b) => a.n - b.n)

  /** Sets both the real count and the field's text together — used by the +/- buttons so the
   *  typed field never drifts out of sync with what they set. */
  function setQuestionCountClamped(n: number) {
    const clamped = Math.max(5, Math.min(questionCap, n))
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

  /** Switches a row between MC and grid-in — a blank row defaults to MC (nothing to switch away
   *  from), so this only has real work to do when the row's current kind doesn't match. */
  function setRowType(n: number, type: 'mc' | 'gridin') {
    setKey(prev => {
      const current = prev[n]
      if (type === 'gridin') {
        if (isGridin(current)) return prev
        return { ...prev, [n]: { n, answer: '', points: current?.points ?? 1, type: 'gridin', digits: DEFAULT_GRIDIN_DIGITS } }
      }
      if (!isGridin(current)) return prev
      const next = { ...prev }
      delete next[n]
      return next
    })
  }

  function setGridinAnswer(n: number, answer: string) {
    setKey(prev => {
      const current = prev[n]
      if (!isGridin(current)) return prev
      return { ...prev, [n]: { ...current, answer } }
    })
  }

  function setGridinDigits(n: number, digits: number) {
    setKey(prev => {
      const current = prev[n]
      if (!isGridin(current)) return prev
      return { ...prev, [n]: { ...current, digits: Math.max(GRIDIN_MIN_DIGITS, Math.min(GRIDIN_MAX_DIGITS, digits)) } }
    })
  }

  /** A stable fingerprint of everything that must match between two versions for the FORM-bubble
   *  design to be correct: same question count, same choice count, and per question the same
   *  type/multi-select-ness/digit count. Deliberately ignores the actual correct answer(s) —
   *  that's the one thing versions are supposed to differ on. */
  function shapeFingerprint(a: RedPenAssessment): string {
    return JSON.stringify({
      questionCount: a.questionCount,
      choiceCount: a.choiceCount,
      rows: a.answerKey
        .map(e => ({ n: e.n, type: e.type ?? 'mc', multi: Array.isArray(e.answer), digits: e.digits }))
        .sort((x, y) => x.n - y.n),
    })
  }

  async function handleSave() {
    if (!user) return
    const assessment: RedPenAssessment = {
      id: initial.id ?? uuid(),
      title: title.trim() || 'Untitled assessment',
      questionCount,
      choiceCount,
      // An in-progress/invalid grid-in answer (blank, or not yet matching the numeric shape)
      // doesn't get saved into the key at all — same as an MC row nobody's clicked a letter for
      // yet, rather than silently saving e.g. "" (which Number('') treats as a valid 0).
      answerKey: Object.values(key)
        .filter(e => e.n <= questionCount)
        .filter(e => e.type !== 'gridin' || (typeof e.answer === 'string' && GRIDIN_ANSWER_RE.test(e.answer)))
        .sort((a, b) => a.n - b.n),
      unscorable: initial.unscorable,
      createdAt: initial.createdAt ?? new Date().toISOString(),
      ...(initial.versionGroupId ? { versionGroupId: initial.versionGroupId } : {}),
      ...(initial.versionLabel ? { versionLabel: initial.versionLabel } : {}),
    }

    // Shape-mismatch check — only meaningful once a sibling version actually exists to compare
    // against, and only blocks once (shapeWarning showing means the teacher already saw it and
    // clicked Save again anyway).
    if (assessment.versionGroupId && !shapeWarning) {
      const siblings = (await listVersionGroup(user.uid, assessment.versionGroupId)).filter(v => v.id !== assessment.id)
      const mismatched = siblings.find(v => shapeFingerprint(v) !== shapeFingerprint(assessment))
      if (mismatched) {
        setShapeWarning(
          `This doesn't match Version ${mismatched.versionLabel ?? '?'}'s shape (question count, choice count, or ` +
          'which questions are grid-in/multi-select) — the printed FORM bubble only works if every version has the ' +
          'exact same layout. Click Save again to save anyway.',
        )
        return
      }
    }

    try {
      await saveAssessment(user.uid, assessment)

      // Regrade every already-scored sheet against the corrected key — no rescan needed, since
      // each result already stored exactly what was given for every question
      // (RedPenResponse.given); scoreAssessment just needs that rebuilt as a Map. For a version
      // group, an administration's own assessmentId is always the primary (Version A) — resolve
      // that first, then only touch results that were actually scored against *this* version.
      const lookupId = assessment.versionGroupId
        ? (primaryOfGroup(await listVersionGroup(user.uid, assessment.versionGroupId))?.id ?? assessment.id)
        : assessment.id
      const administrations = await listAdministrations(user.uid, lookupId)
      let regraded = 0
      for (const admin of administrations) {
        const results = await listResults(user.uid, admin.id)
        for (const r of results) {
          if ((r.assessmentId ?? admin.assessmentId) !== assessment.id) continue
          const given = new Map<number, AnswerValue | null>(r.responses.map(resp => [resp.n, resp.given]))
          const { score, maxScore, responses } = scoreAssessment(assessment, given)
          await saveResult(user.uid, { ...r, score, maxScore, responses })
          regraded++
        }
      }

      setRegradedCount(regraded)
      setSaved(true)
      setTimeout(() => onSaved(assessment), regraded > 0 ? 1400 : 500)
    } catch {
      setSaveError("Couldn't save — try again.")
    }
  }

  const half = Math.ceil(questionCount / 2)
  const colA = Array.from({ length: half }, (_, i) => i + 1)
  const colB = Array.from({ length: questionCount - half }, (_, i) => i + half + 1)

  function renderRow(n: number) {
    const entry = key[n]
    const numberLabel = (
      <div className="font-mono text-xs text-[var(--color-muted)] w-5 text-right flex-shrink-0">{String(n).padStart(2, '0')}</div>
    )

    if (isLockedImport(entry)) {
      return (
        <div key={n} className={`flex items-center gap-3.5 px-2 py-1 rounded ${n % 5 === 0 ? 'bg-[var(--color-panel)]' : ''}`}>
          {numberLabel}
          <div className="font-mono text-xs px-2.5 py-1 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)]">
            {Array.isArray(entry!.answer) ? entry!.answer.join(', ') : String(entry!.answer)} (imported, locked)
          </div>
        </div>
      )
    }

    const gridin = isGridin(entry)
    const gridinAnswerValid = gridin ? entry.answer === '' || GRIDIN_ANSWER_RE.test(entry.answer) : true

    return (
      <div key={n} className={`flex items-center gap-3 px-2 py-1.5 rounded ${n % 5 === 0 ? 'bg-[var(--color-panel)]' : ''}`}>
        {numberLabel}
        <div className="flex rounded-md border border-[var(--color-border)] overflow-hidden flex-shrink-0">
          <button
            onClick={() => setRowType(n, 'mc')}
            className={`px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wide transition-colors ${
              !gridin ? 'bg-[var(--color-text)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            MC
          </button>
          <button
            onClick={() => setRowType(n, 'gridin')}
            className={`px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wide transition-colors ${
              gridin ? 'bg-[var(--color-text)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Grid-in
          </button>
        </div>

        {gridin ? (
          <div className="flex items-center gap-2.5">
            <input
              value={entry.answer}
              onChange={e => setGridinAnswer(n, e.target.value)}
              placeholder="-4.5"
              className={`font-mono text-xs w-20 px-2 py-1.5 rounded border bg-[var(--color-surface)] ${
                gridinAnswerValid ? 'border-[var(--color-border)]' : 'border-[var(--color-danger)]'
              }`}
            />
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--color-muted)]">digits</span>
              <input
                type="text"
                inputMode="numeric"
                value={String(entry.digits ?? DEFAULT_GRIDIN_DIGITS)}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '')
                  if (v !== '') setGridinDigits(n, parseInt(v, 10))
                }}
                className="font-mono text-xs w-7 px-1 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-center"
              />
            </div>
            {!gridinAnswerValid && (
              <span className="text-[10px] text-[var(--color-danger)]">digits and an optional leading − / decimal point only</span>
            )}
          </div>
        ) : (
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
            {saved ? 'Saved ✓' : shapeWarning ? 'Save anyway' : 'Save assessment'}
          </button>
          {saved && regradedCount !== null && regradedCount > 0 && (
            <div className="text-xs text-[var(--color-accent-strong)]">
              Regraded {regradedCount} already-scored sheet{regradedCount === 1 ? '' : 's'} — no rescan needed.
            </div>
          )}
          {saveError && <div className="text-xs text-[var(--color-danger)]">{saveError}</div>}
        </div>
      </div>

      {shapeWarning && (
        <div className="text-sm text-[var(--color-gold-text)] bg-[var(--color-gold-light)] rounded-lg p-3.5">
          {shapeWarning}
        </div>
      )}

      {droppedEntries.length > 0 && (
        <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-3.5">
          Q{droppedEntries.map(e => e.n).join(', Q')} won&apos;t be saved — {droppedEntries.length === 1 ? 'it goes' : 'they go'}{' '}
          past question {questionCount}, this sheet&apos;s limit{gridinCount > 0 ? ` with ${gridinCount} grid-in question${gridinCount === 1 ? '' : 's'} on it` : ''}.{' '}
          Remove a grid-in question (each reserves extra space) or trim the key to fit them — see the limit explained
          below the question count.
        </div>
      )}

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
                if (digits !== '') setQuestionCount(Math.min(questionCap, parseInt(digits, 10)))
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
          <div className="text-xs text-[var(--color-muted)] mt-2.5 leading-relaxed">
            Up to <span className="font-mono">{questionCap}</span> questions fit on one printed sheet
            {gridinCount > 0
              ? ` — ${gridinCount} grid-in question${gridinCount === 1 ? '' : 's'} each reserve extra space below the bubble grid, so the limit is lower than if it were all multiple choice.`
              : '.'}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4.5">
          <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2.5">
            Choices per question
          </div>
          {/* Every letter up through the one clicked lights up — there's no way to end up with a
              gap (A, C, F picked but not B, D, E), since every MC row on a sheet always prints
              A through the Nth letter in order, never an arbitrary subset. Clamped to 2 so a
              stray click on A alone can't leave a question with just one choice. */}
          <div className="flex gap-1.5">
            {LETTERS.map((letter, i) => {
              const selected = i < choiceCount
              return (
                <button
                  key={letter}
                  onClick={() => setChoiceCount(Math.max(2, i + 1))}
                  title={`A–${letter}`}
                  className={`w-8 h-8 rounded-full border font-mono text-xs flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]'
                  }`}
                >
                  {letter}
                </button>
              )
            })}
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
