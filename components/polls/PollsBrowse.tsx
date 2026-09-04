'use client'

// The combined Polls landing page (per the nav-reorg handoff): a class-code join box, the
// public polls list, and "Your polls" all on one page — replaces what used to be three separate
// tab screens (RespondClass/RespondPublic/MyPolls, now deleted). Moderation queue isn't a nav
// item anywhere; it's a role-checked link right here, visible only to the moderator.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/AuthProvider'
import { isPollsModerator } from '@/lib/featureFlags'
import { normalizeCode } from '@/lib/polls/code'
import { closePoll, getMyResponse, getPollByClassCode, listMyPolls, listPublicPolls } from '@/lib/polls/storage'
import { Poll, PollStatus } from '@/lib/polls/types'
import { PollsError, PollsLoading } from './PollsStatus'

interface PollsBrowseProps {
  onAnswer: (poll: Poll) => void
  onResults: (pollId: string) => void
  onEdit: (pollId: string) => void
  onModerate: () => void
}

const STATUS_LABEL: Record<PollStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Open',
  rejected: 'Not approved',
  closed: 'Closed',
}

export function PollsBrowse({ onAnswer, onResults, onEdit, onModerate }: PollsBrowseProps) {
  const { user } = useAuth()
  const moderator = isPollsModerator(user)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publicPolls, setPublicPolls] = useState<Poll[]>([])
  const [myPolls, setMyPolls] = useState<Poll[]>([])
  const [myResponseIds, setMyResponseIds] = useState<Set<string>>(new Set())
  const [closingId, setClosingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [codeInput, setCodeInput] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  async function refresh(uid: string) {
    try {
      const [publicList, mineList] = await Promise.all([listPublicPolls(), listMyPolls(uid)])
      const responseChecks = await Promise.all(publicList.map(p => getMyResponse(p.id, uid)))
      setPublicPolls(publicList)
      setMyResponseIds(new Set(publicList.filter((_, i) => responseChecks[i]).map(p => p.id)))
      mineList.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setMyPolls(mineList)
      setError(null)
    } catch {
      setError("Couldn't load polls. Try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    refresh(user.uid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  if (!user) return <PollsError message="Sign in to see polls." />
  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />

  async function handleJoinCode() {
    setCheckingCode(true)
    setCodeError(null)
    try {
      const found = await getPollByClassCode(codeInput)
      if (!found) { setCodeError("That code doesn't match an open poll. Check with your teacher and try again."); return }
      if (found.status === 'closed') { setCodeError('This poll has closed and is no longer accepting responses.'); return }
      onAnswer(found)
    } catch {
      setCodeError("Couldn't look up that code. Try again.")
    } finally {
      setCheckingCode(false)
    }
  }

  async function copyLink(p: Poll) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/p/${p.mode === 'class' ? p.classCode : p.id}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* clipboard access can fail silently (permissions, insecure context) */ }
  }

  async function handleClose(p: Poll) {
    if (!user) return
    setClosingId(p.id)
    try {
      await closePoll(p.id)
      await refresh(user.uid)
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Polls</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Enter a class code, answer a public poll, or manage the ones you&apos;ve created.
          </p>
        </div>
        {moderator && (
          <button
            onClick={onModerate}
            className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] whitespace-nowrap pt-1"
          >
            Moderation queue →
          </button>
        )}
      </div>

      {/* Class code box */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
        <label className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Have a class code?</label>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <input
            value={codeInput}
            onChange={e => setCodeInput(normalizeCode(e.target.value).slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && codeInput.length === 4 && handleJoinCode()}
            maxLength={4}
            placeholder="ABCD"
            className="w-32 text-center font-mono text-2xl font-bold tracking-[0.18em] px-3 py-2.5 rounded-xl border border-[var(--color-border)] uppercase placeholder:text-[var(--color-border)]"
          />
          <button
            onClick={handleJoinCode}
            disabled={codeInput.length !== 4 || checkingCode}
            className="px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold hover:brightness-105 transition-all disabled:opacity-50"
          >
            {checkingCode ? 'Checking…' : 'Join →'}
          </button>
        </div>
        {codeError && (
          <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg px-3 py-2 max-w-sm">{codeError}</div>
        )}
      </div>

      {/* Public polls */}
      <div className="space-y-3">
        <h3 className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Public polls</h3>
        {publicPolls.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-5 text-center">No public polls yet.</div>
        ) : (
          <div className="space-y-2">
            {publicPolls.map(p => {
              // "See results" instead of "Answer" whenever answering wouldn't make sense
              // anymore: it's yours, you've already answered, or it's closed. Public only —
              // class polls never offer a results shortcut (see AnswerForm.tsx).
              const isMine = p.ownerId === user.uid
              const answered = myResponseIds.has(p.id)
              const isClosed = p.status === 'closed'
              const showResults = isMine || answered || isClosed
              const note = isMine ? 'your poll' : answered ? 'you answered' : isClosed ? 'closed' : null
              return (
                <div key={p.id} className="flex items-center gap-3 border border-[var(--color-border)] rounded-xl bg-white px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--color-text)]">{p.title}</div>
                    <div className="font-mono text-[11.5px] text-[var(--color-muted)] mt-0.5">
                      {p.category || 'General'} · {p.responseCount} response{p.responseCount === 1 ? '' : 's'}
                      {note && <span className="text-[var(--color-accent-strong)]"> · {note}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => (showResults ? onResults(p.id) : onAnswer(p))}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                      showResults ? 'bg-[var(--color-panel)] text-[var(--color-text)]' : 'bg-[var(--color-accent)] text-white hover:brightness-105'
                    }`}
                  >
                    {showResults ? 'See results' : 'Answer'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="text-xs text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3.5">
          Anyone can create a public poll, but nothing appears here until it clears moderation.
        </div>
      </div>

      {/* Your polls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Your polls</h3>
          <Link href="/workspace?mode=library&section=createPoll" className="text-xs font-semibold text-[var(--color-accent-strong)] hover:underline">
            + Create poll
          </Link>
        </div>
        {myPolls.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] rounded-lg p-5 text-center">
            You haven&apos;t created a poll yet.
          </div>
        ) : (
          <div className="space-y-2">
            {myPolls.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 border border-[var(--color-border)] rounded-xl bg-white px-4 py-3.5"
                style={{ borderLeftWidth: 4, borderLeftColor: p.mode === 'class' ? 'var(--color-gold)' : 'var(--color-accent)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: p.mode === 'class' ? 'var(--color-gold)' : 'var(--color-accent)' }}
                    />
                    {p.title}
                  </div>
                  <div className="font-mono text-[11.5px] text-[var(--color-muted)] mt-0.5">
                    {p.mode === 'class' ? 'Class' : 'Public'} · {STATUS_LABEL[p.status]} · {p.responseCount} response{p.responseCount === 1 ? '' : 's'}
                  </div>
                </div>
                {p.status === 'pending_review' ? (
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded bg-[var(--color-gold-light)] text-[var(--color-gold-text)] whitespace-nowrap">
                    Pending
                  </span>
                ) : p.status === 'rejected' ? (
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded bg-[var(--color-danger-light)] text-[var(--color-danger)] whitespace-nowrap">
                    Not approved
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => onEdit(p.id)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
                      Edit
                    </button>
                    <button onClick={() => copyLink(p)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
                      {copiedId === p.id ? 'Copied' : 'Copy link'}
                    </button>
                    {p.status === 'published' && (
                      <button
                        onClick={() => handleClose(p)}
                        disabled={closingId === p.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-danger-light)] text-[var(--color-danger)] disabled:opacity-50"
                      >
                        {closingId === p.id ? 'Closing…' : 'Close'}
                      </button>
                    )}
                    <button onClick={() => onResults(p.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white">
                      Results
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
