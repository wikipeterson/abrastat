'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { getMyResponse, submitResponse } from '@/lib/polls/storage'
import { Poll, PollQuestion } from '@/lib/polls/types'
import { PollsLoading } from './PollsStatus'

interface AnswerFormProps {
  poll: Poll
  /** Called both after a fresh submit and when the respondent already answered — either way the
   *  caller's job is the same: show them where results/next-steps live. */
  onDone: () => void
}

function isValidAnswer(q: PollQuestion, value: string | number | undefined): boolean {
  if (q.type === 'categorical') return typeof value === 'string' && (q.choices ?? []).includes(value)
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (q.min !== undefined && value < q.min) return false
  if (q.max !== undefined && value > q.max) return false
  return true
}

/** The shared multi-question answer UI + submit — used by the class-code respond flow, the
 *  public browse-and-answer flow, and the `/p/[token]` share-link route, so a poll is always
 *  answered the same way regardless of how someone reached it. */
export function AnswerForm({ poll, onDone }: AnswerFormProps) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!user) {
      Promise.resolve().then(() => { if (!cancelled) setChecking(false) })
      return () => { cancelled = true }
    }
    getMyResponse(poll.id, user.uid)
      .then(r => { if (!cancelled) setAlreadyAnswered(!!r) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [poll.id, user])

  if (checking) return <PollsLoading />

  if (!user) {
    return <InfoBox tone="danger" text="Sign in to answer this poll." />
  }
  if (poll.status === 'closed') {
    return <InfoBox tone="muted" text="This poll has closed and is no longer accepting responses." action={{ label: 'See results →', onClick: onDone }} />
  }
  if (poll.status !== 'published') {
    return <InfoBox tone="gold" text="This poll is still pending review and isn't open yet." />
  }
  if (alreadyAnswered) {
    return <InfoBox tone="accent" text="You've already answered this poll." action={{ label: 'See results →', onClick: onDone }} />
  }

  const canSubmit = poll.questions.every(q => isValidAnswer(q, answers[q.id]))

  function setAnswer(questionId: string, value: string | number | undefined) {
    setAnswers(prev => {
      const next = { ...prev }
      if (value === undefined) delete next[questionId]
      else next[questionId] = value
      return next
    })
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return
    setSubmitting(true)
    setError(null)
    const result = await submitResponse(poll, user.uid, answers)
    setSubmitting(false)
    if (!result.ok) { setError(result.error); return }
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl p-5 space-y-6">
        {poll.questions.map((q, i) => (
          <QuestionAnswer key={q.id} index={i} question={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} />
        ))}
      </div>
      {error && <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-3">{error}</div>}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="px-6 py-3 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold hover:brightness-105 transition-all disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit response'}
      </button>
    </div>
  )
}

function QuestionAnswer({
  index, question, value, onChange,
}: {
  index: number
  question: PollQuestion
  value: string | number | undefined
  onChange: (value: string | number | undefined) => void
}) {
  return (
    <div>
      <div className="font-serif italic text-base font-semibold text-[var(--color-text)] mb-3">
        {index + 1}. {question.prompt}
      </div>
      {question.type === 'categorical' ? (
        <div className="space-y-2">
          {(question.choices ?? []).map(choice => {
            const on = value === choice
            return (
              <button
                key={choice}
                onClick={() => onChange(choice)}
                className={`w-full flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                  on ? 'border-[var(--color-accent)] bg-white' : 'border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    on ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'
                  }`}
                >
                  {on && <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />}
                </span>
                {choice}
              </button>
            )
          })}
        </div>
      ) : (
        <div>
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={question.min}
            max={question.max}
            step={question.decimals ? 1 / Math.pow(10, question.decimals) : 1}
            onChange={e => {
              if (e.target.value === '') { onChange(undefined); return }
              const n = Number(e.target.value)
              onChange(Number.isFinite(n) ? n : undefined)
            }}
            className="w-40 px-3.5 py-2.5 rounded-lg border border-[var(--color-border)] bg-white text-sm font-mono"
          />
          {(question.min !== undefined || question.max !== undefined) && (
            <div className="text-xs text-[var(--color-muted)] mt-1.5 font-mono">
              {question.min !== undefined && question.max !== undefined
                ? `Between ${question.min} and ${question.max}`
                : question.min !== undefined
                ? `At least ${question.min}`
                : `At most ${question.max}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoBox({
  tone, text, action,
}: {
  tone: 'danger' | 'muted' | 'gold' | 'accent'
  text: string
  action?: { label: string; onClick: () => void }
}) {
  const toneClass = {
    danger: 'text-[var(--color-danger)] bg-[var(--color-danger-light)]',
    muted: 'text-[var(--color-muted)] bg-[var(--color-panel)]',
    gold: 'text-[var(--color-gold-text)] bg-[var(--color-gold-light)]',
    accent: 'text-[var(--color-accent-strong)] bg-[var(--color-accent-light)]',
  }[tone]
  return (
    <div className={`rounded-lg p-4 text-sm flex items-center justify-between gap-4 flex-wrap ${toneClass}`}>
      <span>{text}</span>
      {action && (
        <button onClick={action.onClick} className="font-semibold hover:underline whitespace-nowrap">
          {action.label}
        </button>
      )}
    </div>
  )
}
