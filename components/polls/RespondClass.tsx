'use client'

import { useState } from 'react'
import { getPollByClassCode } from '@/lib/polls/storage'
import { Poll } from '@/lib/polls/types'
import { AnswerForm } from './AnswerForm'
import { normalizeCode } from '@/lib/polls/code'

export function RespondClass() {
  const [codeInput, setCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [poll, setPoll] = useState<Poll | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleJoin() {
    setChecking(true)
    setError(null)
    setSubmitted(false)
    try {
      const found = await getPollByClassCode(codeInput)
      if (!found) {
        setError("That code doesn't match an open poll. Check with your teacher and try again.")
        setPoll(null)
        return
      }
      if (found.status === 'closed') {
        setError('This poll has closed and is no longer accepting responses.')
        setPoll(null)
        return
      }
      setPoll(found)
    } catch {
      setError("Couldn't look up that code. Try again.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Enter the class code</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Your teacher shared this code. It&apos;s the only way to reach this poll — no public listing.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
        <label className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Class code</label>
        <input
          value={codeInput}
          onChange={e => setCodeInput(normalizeCode(e.target.value).slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && codeInput.length === 4 && handleJoin()}
          maxLength={4}
          placeholder="ABCD"
          className="w-40 text-center font-mono text-3xl font-bold tracking-[0.18em] px-3 py-3 rounded-xl border border-[var(--color-border)] uppercase placeholder:text-[var(--color-border)]"
        />
        {error && (
          <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg px-3 py-2 max-w-sm">
            {error}
          </div>
        )}
        <button
          onClick={handleJoin}
          disabled={codeInput.length !== 4 || checking}
          className="px-6 py-3 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold hover:brightness-105 transition-all disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Join →'}
        </button>
      </div>

      {poll && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Poll · {poll.title}
          </div>
          <div className="p-5">
            {submitted ? (
              <div className="text-sm text-[var(--color-accent-strong)] bg-[var(--color-accent-light)] rounded-lg p-4 text-center font-medium">
                Thanks — your response was recorded.
              </div>
            ) : (
              <AnswerForm poll={poll} onDone={() => setSubmitted(true)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
