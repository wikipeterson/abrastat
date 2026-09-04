'use client'

import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useAuth } from '@/components/auth/AuthProvider'
import { createPoll, getPoll, updatePoll } from '@/lib/polls/storage'
import { Poll, PollMode, PollQuestion, QuestionType } from '@/lib/polls/types'
import { isValidCodeFormat, normalizeCode } from '@/lib/polls/code'
import { PollsError, PollsLoading } from './PollsStatus'

export type NewPollDraft = { pollId: string }

const POLL_CATEGORIES = ['Campus & community', 'Academics', 'Health & lifestyle', 'Sports', 'Just for fun']

interface NewPollProps {
  draft: NewPollDraft | null
  onSaved: (poll: Poll) => void
}

/** Loads the "editing an existing poll" case — the blank-create case has nothing to fetch.
 *  Mirrors components/redpen/AssessmentBuilder.tsx's same split. */
export function NewPoll({ draft, onSaved }: NewPollProps) {
  const [loading, setLoading] = useState(!!draft)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Poll | null>(null)

  useEffect(() => {
    if (!draft) return
    let cancelled = false
    getPoll(draft.pollId)
      .then(poll => {
        if (cancelled) return
        if (!poll) { setLoadError("Couldn't find that poll."); return }
        setExisting(poll)
      })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load that poll. Try again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [draft])

  if (loading) return <PollsLoading />
  if (loadError) return <PollsError message={loadError} />

  return <NewPollForm existing={existing} onSaved={onSaved} />
}

interface QuestionDraft {
  id: string
  prompt: string
  type: QuestionType
  choices: string[]
  min: string
  max: string
  decimals: string
  advancedOpen: boolean
}

function newQuestionDraft(): QuestionDraft {
  return { id: uuid(), prompt: '', type: 'categorical', choices: ['Yes', 'No'], min: '', max: '', decimals: '', advancedOpen: false }
}

function questionToDraft(q: PollQuestion): QuestionDraft {
  return {
    id: q.id,
    prompt: q.prompt,
    type: q.type,
    choices: q.choices && q.choices.length > 0 ? q.choices : ['Yes', 'No'],
    min: q.min !== undefined ? String(q.min) : '',
    max: q.max !== undefined ? String(q.max) : '',
    decimals: q.decimals !== undefined ? String(q.decimals) : '',
    advancedOpen: false,
  }
}

/** null means this question block isn't save-able yet (no prompt, or a categorical question
 *  with fewer than 2 non-empty choices) — used both to block the Create/Save button and to
 *  filter out numeric validation fields that were left blank. */
function draftToQuestion(d: QuestionDraft): PollQuestion | null {
  const prompt = d.prompt.trim()
  if (!prompt) return null
  if (d.type === 'categorical') {
    const choices = d.choices.map(c => c.trim()).filter(Boolean)
    if (choices.length < 2) return null
    return { id: d.id, prompt, type: 'categorical', choices }
  }
  const min = d.min.trim() !== '' ? Number(d.min) : undefined
  const max = d.max.trim() !== '' ? Number(d.max) : undefined
  const decimals = d.decimals.trim() !== '' ? Number(d.decimals) : undefined
  return {
    id: d.id,
    prompt,
    type: 'numeric',
    ...(min !== undefined && Number.isFinite(min) ? { min } : {}),
    ...(max !== undefined && Number.isFinite(max) ? { max } : {}),
    ...(decimals !== undefined && Number.isFinite(decimals) ? { decimals } : {}),
  }
}

function NewPollForm({ existing, onSaved }: { existing: Poll | null; onSaved: (poll: Poll) => void }) {
  const { user } = useAuth()
  const isEditing = !!existing
  const [mode, setMode] = useState<PollMode>(existing?.mode ?? 'class')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [classCode, setClassCode] = useState(existing?.classCode ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [customCategorySelected, setCustomCategorySelected] = useState(
    !!existing?.category && !POLL_CATEGORIES.includes(existing.category)
  )
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    existing && existing.questions.length > 0 ? existing.questions.map(questionToDraft) : [newQuestionDraft()]
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedPoll, setSavedPoll] = useState<Poll | null>(null)

  function patchQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions(qs => qs.map(q => (q.id === id ? { ...q, ...patch } : q)))
  }
  function removeQuestion(id: string) {
    setQuestions(qs => (qs.length > 1 ? qs.filter(q => q.id !== id) : qs))
  }
  function updateChoice(qid: string, idx: number, value: string) {
    setQuestions(qs => qs.map(q => (q.id === qid ? { ...q, choices: q.choices.map((c, i) => (i === idx ? value : c)) } : q)))
  }
  function addChoice(qid: string) {
    setQuestions(qs => qs.map(q => (q.id === qid ? { ...q, choices: [...q.choices, ''] } : q)))
  }
  function removeChoice(qid: string, idx: number) {
    setQuestions(qs => qs.map(q => (q.id === qid && q.choices.length > 1 ? { ...q, choices: q.choices.filter((_, i) => i !== idx) } : q)))
  }

  const builtQuestions = questions.map(draftToQuestion)
  const validQuestions = builtQuestions.filter((q): q is PollQuestion => q !== null)
  const codeInvalid = mode === 'class' && classCode.trim() !== '' && !isValidCodeFormat(normalizeCode(classCode))
  const canSave = !!user && title.trim() !== '' && validQuestions.length === questions.length && !codeInvalid

  async function handleSave() {
    if (!user || !canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      if (isEditing && existing) {
        await updatePoll(existing.id, existing, {
          title: title.trim(),
          questions: validQuestions,
          category: category.trim(),
          classCode,
        })
        onSaved({ ...existing, title: title.trim(), questions: validQuestions })
      } else {
        const poll = await createPoll(user.uid, user.displayName ?? '', {
          mode,
          title: title.trim(),
          questions: validQuestions,
          category: category.trim(),
          classCode,
        })
        setSavedPoll(poll)
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save — try again.")
    } finally {
      setSaving(false)
    }
  }

  if (savedPoll) return <ShareLinkCard poll={savedPoll} onDone={() => onSaved(savedPoll)} />

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">
          {isEditing ? 'Edit poll' : 'New poll'}
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-xl">
          Two ways a poll can live: gated by a class code (private, no moderation needed) or open
          to the public directory (moderated before it&apos;s listed).
        </p>
      </div>

      {!isEditing && (
        <div className="grid grid-cols-2 gap-3">
          <ModeCard
            icon="🔑" label="Class Poll" active={mode === 'class'} onClick={() => setMode('class')}
            description="Visible only with a class code. Built for a roster you control — no review needed."
            badge={{ text: 'Code-gated · no moderation', tone: 'gold' }}
          />
          <ModeCard
            icon="🌐" label="Public Poll" active={mode === 'public'} onClick={() => setMode('public')}
            description="Visible to all AbraStat users. Reviewed before it publishes."
            badge={{ text: 'Moderated before publish', tone: 'danger' }}
          />
        </div>
      )}

      {!isEditing && mode === 'public' && (
        <div className="text-sm bg-[var(--color-danger-light)] border border-[var(--color-border)] rounded-lg p-3.5 leading-relaxed">
          Public polls enter a <b className="text-[var(--color-danger)]">moderation queue</b> before they publish —
          this one won&apos;t be listed or answerable until it&apos;s approved.
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <QuestionBlock
            key={q.id}
            index={i}
            draft={q}
            canRemove={questions.length > 1}
            onPatch={patch => patchQuestion(q.id, patch)}
            onRemove={() => removeQuestion(q.id)}
            onUpdateChoice={(idx, value) => updateChoice(q.id, idx, value)}
            onAddChoice={() => addChoice(q.id)}
            onRemoveChoice={idx => removeChoice(q.id, idx)}
          />
        ))}
      </div>
      <button
        onClick={() => setQuestions(qs => [...qs, newQuestionDraft()])}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[var(--color-border)] text-[var(--color-muted)] rounded-xl py-3 text-sm font-semibold hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
      >
        + Add another question
      </button>

      {mode === 'class' ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Class code settings
          </div>
          <div className="p-5 space-y-3.5">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
                Class code
              </label>
              <input
                value={classCode}
                onChange={e => setClassCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder={isEditing ? '' : 'auto-generated if left blank'}
                maxLength={4}
                className={`font-mono font-bold tracking-[0.15em] text-lg w-32 px-3 py-2 rounded-lg border bg-white uppercase ${
                  codeInvalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
                }`}
              />
              {codeInvalid && <div className="text-xs text-[var(--color-danger)] mt-1.5">Must be exactly 4 letters.</div>}
            </div>
            <div className="text-xs text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3 leading-relaxed">
              One response per account. Closing the poll freezes the dataset and unlocks export. Capped at 1,000 responses.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Public directory settings
          </div>
          <div className="p-5 space-y-3.5">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
                Category
              </label>
              <p className="text-xs text-[var(--color-muted)] mb-1.5">
                Optional — a short label shown next to your poll on the public list, so people browsing can tell
                what it&apos;s about at a glance.
              </p>
              <select
                value={customCategorySelected ? 'other' : category}
                onChange={e => {
                  if (e.target.value === 'other') { setCustomCategorySelected(true); return }
                  setCustomCategorySelected(false)
                  setCategory(e.target.value)
                }}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
              >
                <option value="">General (no category)</option>
                {POLL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="other">Other…</option>
              </select>
              {customCategorySelected && (
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value.slice(0, 60))}
                  placeholder="Type your own category"
                  autoFocus
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
                />
              )}
            </div>
            <div className="text-xs text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3 leading-relaxed">
              One response per account, capped at 1,000 responses.
            </div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <div className="mb-4">
          <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
            Title
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 120))}
            placeholder="What&apos;s this poll about?"
            className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--color-border)] bg-white text-sm font-medium"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-6 py-3 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold hover:brightness-105 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create poll →'}
          </button>
          {saveError && <div className="text-sm text-[var(--color-danger)]">{saveError}</div>}
        </div>
      </div>
    </div>
  )
}

function ModeCard({
  icon, label, description, badge, active, onClick,
}: {
  icon: string; label: string; description: string
  badge: { text: string; tone: 'gold' | 'danger' }
  active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-2xl p-4 bg-white transition-all ${
        active ? 'border-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-light)]' : 'border-[var(--color-border)]'
      }`}
      style={{ borderWidth: 1.5 }}
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--color-panel)] flex items-center justify-center text-base mb-2.5">{icon}</div>
      <div className="font-bold text-[15px] text-[var(--color-text)]">{label}</div>
      <div className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">{description}</div>
      <span
        className={`inline-block mt-2.5 font-mono text-[9.5px] font-bold uppercase tracking-wide px-2 py-1 rounded ${
          badge.tone === 'gold'
            ? 'bg-[var(--color-gold-light)] text-[var(--color-gold-text)]'
            : 'bg-[var(--color-danger-light)] text-[var(--color-danger)]'
        }`}
      >
        {badge.text}
      </span>
    </button>
  )
}

function QuestionBlock({
  index, draft, canRemove, onPatch, onRemove, onUpdateChoice, onAddChoice, onRemoveChoice,
}: {
  index: number
  draft: QuestionDraft
  canRemove: boolean
  onPatch: (patch: Partial<QuestionDraft>) => void
  onRemove: () => void
  onUpdateChoice: (idx: number, value: string) => void
  onAddChoice: () => void
  onRemoveChoice: (idx: number) => void
}) {
  return (
    <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-panel)] border-b border-[var(--color-border)]">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Question {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-danger)]">
            Remove
          </button>
        )}
      </div>
      <div className="p-4 space-y-3.5">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">Prompt</label>
          <input
            value={draft.prompt}
            onChange={e => onPatch({ prompt: e.target.value.slice(0, 200) })}
            placeholder="Type your question..."
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">Response type</label>
          <div className="grid grid-cols-2 gap-2">
            <TypeCard
              active={draft.type === 'categorical'} onClick={() => onPatch({ type: 'categorical' })}
              label="Categorical" description="Yes/No, multiple choice → feeds Proportions"
            />
            <TypeCard
              active={draft.type === 'numeric'} onClick={() => onPatch({ type: 'numeric' })}
              label="Numeric" description="A number response → feeds Means"
            />
          </div>
        </div>

        {draft.type === 'categorical' ? (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">Choices</label>
            <div className="space-y-2">
              {draft.choices.map((c, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={c}
                    onChange={e => onUpdateChoice(idx, e.target.value.slice(0, 60))}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm"
                  />
                  {draft.choices.length > 1 && (
                    <button onClick={() => onRemoveChoice(idx)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-danger)] px-2">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={onAddChoice}
              className="mt-2.5 flex items-center gap-1.5 border border-dashed border-[var(--color-border)] text-[var(--color-muted)] rounded-lg px-3 py-1.5 text-xs font-semibold hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
            >
              + Add choice
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => onPatch({ advancedOpen: !draft.advancedOpen })}
              className="text-xs font-semibold text-[var(--color-accent-strong)]"
            >
              ⚙ Advanced settings
            </button>
            {draft.advancedOpen && (
              <div className="mt-2.5 p-3 bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg space-y-2.5">
                <div className="text-xs text-[var(--color-muted)]">Response validation for numeric answers — optional.</div>
                <div className="flex gap-2.5">
                  <NumField label="Min value" value={draft.min} onChange={v => onPatch({ min: v })} placeholder="0" />
                  <NumField label="Max value" value={draft.max} onChange={v => onPatch({ max: v })} placeholder="100" />
                  <NumField label="Decimals" value={draft.decimals} onChange={v => onPatch({ decimals: v })} placeholder="0" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TypeCard({ active, onClick, label, description }: { active: boolean; onClick: () => void; label: string; description: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-lg p-3 bg-white transition-colors ${
        active ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)]'
      }`}
      style={{ borderWidth: 1.5 }}
    >
      <div className="font-bold text-[13px] text-[var(--color-text)]">{label}</div>
      <div className="text-[11.5px] text-[var(--color-muted)] mt-0.5 leading-snug">{description}</div>
    </button>
  )
}

function NumField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex-1">
      <label className="block font-mono text-[9.5px] uppercase tracking-wide text-[var(--color-muted)] mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9.-]/g, ''))}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-border)] bg-white text-sm"
      />
    </div>
  )
}

function ShareLinkCard({ poll, onDone }: { poll: Poll; onDone: () => void }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/p/${poll.mode === 'class' ? poll.classCode : poll.id}`
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard access can fail silently (permissions, insecure context) — link is still selectable */ }
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6 text-center">
      <div className="space-y-2">
        <div className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">
          {poll.mode === 'class' ? 'Poll created' : 'Poll submitted for review'}
        </div>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          {poll.mode === 'class'
            ? "Anyone with this link goes straight to the poll and can respond — the class code is baked in, so they won't be asked to enter it separately."
            : "Anyone with this link goes straight to the poll. It still needs to clear moderation before it's answerable."}
        </p>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <div className="flex gap-2">
          <input
            readOnly value={link}
            className="flex-1 font-mono text-sm px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]"
          />
          <button
            onClick={copy}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors whitespace-nowrap"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <button
        onClick={onDone}
        className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all"
      >
        Go to My Polls
      </button>
    </div>
  )
}
