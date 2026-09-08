'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { Modal } from '@/components/ui/Modal'
import { saveDataset } from '@/lib/firestore'
import { exportGridAsCsv } from '@/lib/datasetExport'
import { buildGridFromPoll } from '@/lib/polls/dataset'
import { aggregateCategorical, aggregateNumeric, NumericEntry } from '@/lib/polls/results'
import { closePoll, deleteResponse, getPoll, listResponses, resetPoll, updateResponseAnswer } from '@/lib/polls/storage'
import { Poll, PollQuestion, PollResponse, PollStatus } from '@/lib/polls/types'
import { PollsError, PollsLoading } from './PollsStatus'

interface PollResultsProps {
  pollId: string
  onSendToLab: (datasetId: string) => void
}

const STATUS_LABEL: Record<PollStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Open',
  rejected: 'Not approved',
  closed: 'Closed',
}

export function PollResults({ pollId, onSendToLab }: PollResultsProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poll, setPoll] = useState<Poll | null>(null)
  const [responses, setResponses] = useState<PollResponse[]>([])
  const [closing, setClosing] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [correcting, setCorrecting] = useState<{ question: PollQuestion; entry: NumericEntry } | null>(null)

  async function refresh() {
    try {
      const p = await getPoll(pollId)
      if (!p) { setError("Couldn't find that poll."); return }
      const r = await listResponses(pollId)
      setPoll(p)
      setResponses(r)
      setError(null)
    } catch {
      setError("Couldn't load results — either this poll doesn't allow you to view them yet, or something went wrong. Try refreshing.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId])

  if (loading) return <PollsLoading />
  if (error) return <PollsError message={error} />
  if (!poll) return null

  const isOwner = user?.uid === poll.ownerId

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  async function handleClose() {
    if (!poll) return
    setClosing(true)
    try {
      await closePoll(poll.id)
      await refresh()
    } finally {
      setClosing(false)
    }
  }

  async function handleReset() {
    if (!poll) return
    setResetting(true)
    try {
      await resetPoll(poll.id)
      setConfirmingReset(false)
      await refresh()
    } finally {
      setResetting(false)
    }
  }

  function handleExportCsv() {
    if (!poll) return
    exportGridAsCsv(buildGridFromPoll(poll, responses), poll.title)
  }

  async function handleSendToLab() {
    if (!poll || !user) return
    setSending(true)
    try {
      const grid = buildGridFromPoll(poll, responses)
      const id = await saveDataset(user, poll.title, `Responses to "${poll.title}" from AbraStat Polls.`, '📊', false, grid)
      onSendToLab(id)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h2 className="font-serif italic text-2xl font-semibold text-[var(--color-text)]">Results &amp; export</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {poll.title} · click Refresh to pull in new responses — export includes every question as columns in one dataset for the Lab.
        </p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <StatBox label="Respondents" value={String(responses.length)} />
        <StatBox label="Status" value={STATUS_LABEL[poll.status]} tone={poll.status === 'published' ? 'accent' : 'muted'} />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          {isOwner && (poll.status === 'published' || poll.status === 'closed') && (
            <>
              <button
                onClick={() => setConfirmingReset(true)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
              >
                Reset poll
              </button>
              {poll.status === 'published' && (
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
                >
                  {closing ? 'Closing…' : 'Close poll'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {poll.status === 'closed' && (
        <div className="text-sm text-[var(--color-muted)] bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-3.5">
          Poll closed — no further responses accepted. Dataset is frozen and ready to export.
        </div>
      )}

      <div className="space-y-4">
        {poll.questions.map((q, i) => (
          <QuestionResultCard
            key={q.id}
            index={i}
            question={q}
            responses={responses}
            onCorrect={isOwner ? entry => setCorrecting({ question: q, entry }) : undefined}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleExportCsv}
          disabled={responses.length === 0}
          className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={handleSendToLab}
          disabled={responses.length === 0 || sending}
          className="px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-50"
        >
          {sending ? 'Sending…' : '→ Send to the Lab'}
        </button>
      </div>

      <Modal open={confirmingReset} onClose={() => setConfirmingReset(false)} title="Reset poll?">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            This permanently deletes all <span className="font-medium text-[var(--color-text)]">{responses.length}</span> current
            response{responses.length === 1 ? '' : 's'} — including any you submitted yourself — and reopens the poll if it&apos;s
            closed. The poll itself, its share link, and its questions are unaffected, so you can hand it to a fresh audience
            without recreating it. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmingReset(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-danger)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
            >
              {resetting ? 'Resetting…' : 'Reset poll'}
            </button>
          </div>
        </div>
      </Modal>

      {correcting && (
        <CorrectResponseModal
          poll={poll}
          question={correcting.question}
          entry={correcting.entry}
          onClose={() => setCorrecting(null)}
          onSaved={() => { setCorrecting(null); refresh() }}
        />
      )}
    </div>
  )
}

function CorrectResponseModal({
  poll, question, entry, onClose, onSaved,
}: {
  poll: Poll
  question: PollQuestion
  entry: NumericEntry
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState<number | undefined>(entry.value)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = typeof value === 'number' && Number.isFinite(value)
    && (question.min === undefined || value >= question.min)
    && (question.max === undefined || value <= question.max)

  async function handleSave() {
    if (!valid || value === undefined) return
    setSaving(true)
    setError(null)
    try {
      await updateResponseAnswer(poll.id, entry.userId, question.id, value)
      onSaved()
    } catch {
      setError("Couldn't save that change. Try again.")
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteResponse(poll.id, entry.userId)
      onSaved()
    } catch {
      setError("Couldn't delete that response. Try again.")
      setDeleting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={confirmingDelete ? 'Delete this response?' : 'Correct this response'}>
      {confirmingDelete ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            This permanently removes this respondent&apos;s entire answer to the poll — every question, not just this
            one — and lowers the respondent count by one. This can&apos;t be undone.
          </p>
          {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmingDelete(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-danger)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete response'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-muted)]">
            Submitted {new Date(entry.submittedAt).toLocaleString()}
          </p>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">
              {question.prompt}
            </label>
            <input
              type="number"
              value={value ?? ''}
              min={question.min}
              max={question.max}
              step={question.decimals ? 1 / Math.pow(10, question.decimals) : 1}
              onChange={e => setValue(e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] font-mono text-sm"
            />
          </div>
          {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setConfirmingDelete(true)} className="text-xs font-semibold text-[var(--color-danger)] hover:underline">
              Delete this response
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!valid || saving}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium hover:brightness-105 transition-all disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'muted' }) {
  const color = tone === 'accent' ? 'text-[var(--color-accent)]' : tone === 'muted' ? 'text-[var(--color-muted)]' : 'text-[var(--color-gold)]'
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

function QuestionResultCard({
  index, question, responses, onCorrect,
}: {
  index: number
  question: PollQuestion
  responses: PollResponse[]
  /** Owner-only — passed through from PollResults, undefined for anyone else viewing results. */
  onCorrect?: (entry: NumericEntry) => void
}) {
  const answeredCount = responses.filter(r => r.answers[question.id] !== undefined).length
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] font-mono text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
        Q{index + 1} · {question.prompt}
      </div>
      <div className="p-5">
        {answeredCount === 0 ? (
          <div className="text-sm text-[var(--color-muted)] text-center py-6">No responses yet.</div>
        ) : question.type === 'categorical' ? (
          <CategoricalChart question={question} responses={responses} />
        ) : (
          <NumericChart question={question} responses={responses} onCorrect={onCorrect} />
        )}
      </div>
    </div>
  )
}

function CategoricalChart({ question, responses }: { question: PollQuestion; responses: PollResponse[] }) {
  const tallies = aggregateCategorical(question, responses)
  const maxCount = Math.max(1, ...tallies.map(t => t.count))
  return (
    <div className="space-y-2.5">
      {tallies.map(t => (
        <div key={t.choice} className="grid grid-cols-[110px_1fr_46px] items-center gap-2.5">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate" title={t.choice}>{t.choice}</div>
          <div className="h-6 rounded bg-[var(--color-panel)] overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${(t.count / maxCount) * 100}%`, background: t.count === maxCount && t.count > 0 ? 'var(--color-gold)' : 'var(--color-accent)' }}
            />
          </div>
          <div className="font-mono text-sm font-bold text-right">{t.count}</div>
        </div>
      ))}
    </div>
  )
}

function NumericChart({
  question, responses, onCorrect,
}: {
  question: PollQuestion
  responses: PollResponse[]
  onCorrect?: (entry: NumericEntry) => void
}) {
  const summary = aggregateNumeric(question, responses)
  const showEvery = Math.max(1, Math.ceil(summary.buckets.length / 14))
  return (
    <div>
      {onCorrect && (
        <p className="text-xs text-[var(--color-muted)] mb-2">Click a dot to correct or remove that response.</p>
      )}
      <div className="flex items-end gap-1 h-32 border-b-2 border-[var(--color-border)] pb-1 mb-1 px-1 overflow-x-auto">
        {summary.buckets.map(b => (
          <div key={b.start} className="flex-1 min-w-[7px] flex flex-col-reverse items-center gap-1">
            {b.entries.map((e, i) => {
              const gold = summary.median !== null && b.start <= summary.median && summary.median <= b.end
              return onCorrect ? (
                <button
                  key={e.userId}
                  onClick={() => onCorrect(e)}
                  title="Click to correct or remove this response"
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-[var(--color-text)] transition-all"
                  style={{ background: gold ? 'var(--color-gold)' : 'var(--color-accent)' }}
                />
              ) : (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: gold ? 'var(--color-gold)' : 'var(--color-accent)' }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-1 px-1 mb-4">
        {summary.buckets.map((b, i) => (
          <div key={b.start} className="flex-1 min-w-[7px] text-center font-mono text-[10px] text-[var(--color-muted)]">
            {i % showEvery === 0 ? (b.start === b.end ? b.start : `${b.start}–${b.end}`) : ''}
          </div>
        ))}
      </div>
      <div className="flex gap-6">
        <StatBox label="Mean" value={summary.mean !== null ? summary.mean.toFixed(1) : '—'} />
        <StatBox label="Median" value={summary.median !== null ? String(summary.median) : '—'} />
        <StatBox label="Range" value={summary.min !== null ? `${summary.min}–${summary.max}` : '—'} />
      </div>
    </div>
  )
}
