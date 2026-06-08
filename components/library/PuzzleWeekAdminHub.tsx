'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, RotateCcw, Search, Shield, Users } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'
import {
  adminRemovePuzzleWeekMember,
  adminRenamePuzzleWeekEntry,
  adminResetPuzzleWeekEntry,
  CURRENT_PUZZLE_WEEK_EVENT,
  getPuzzleWeekAdminEntries,
  PuzzleWeekAdminEntry,
  PUZZLE_WEEK_PUZZLES,
} from '@/lib/puzzleWeek'

const PUZZLE_TITLE_BY_ID = new Map(PUZZLE_WEEK_PUZZLES.map(puzzle => [puzzle.id, puzzle.title]))

function csvValue(value: string | number) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows.map(row => row.map(csvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function PuzzleWeekAdminHub() {
  const { user, loading, isGuest } = useAuth()
  const [entries, setEntries] = useState<PuzzleWeekAdminEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [draftNames, setDraftNames] = useState<Record<string, string>>({})

  const canManage = canManagePuzzleWeekIdentity(user)

  async function loadAdminEntries(currentUser: NonNullable<typeof user>) {
    setLoadingEntries(true)
    setError(null)
    try {
      const data = await getPuzzleWeekAdminEntries(CURRENT_PUZZLE_WEEK_EVENT.id, currentUser)
      setEntries(data)
      setDraftNames(Object.fromEntries(data.map(item => [item.entry.id, item.entry.name])))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not load Puzzle Week admin data.')
    } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => {
    if (!user || isGuest || !canManage) {
      setEntries([])
      return
    }
    void loadAdminEntries(user)
  }, [user, isGuest, canManage])

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(item => {
      const haystack = [
        item.entry.name,
        item.entry.joinCode ?? '',
        item.entry.type,
        ...item.members.map(member => member.displayName),
        ...item.members.map(member => member.email),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, search])

  const summary = useMemo(() => {
    const teamCount = entries.filter(item => item.entry.type === 'team').length
    const soloCount = entries.filter(item => item.entry.type === 'solo').length
    return { total: entries.length, teamCount, soloCount }
  }, [entries])

  async function handleRename(entryId: string) {
    if (!user) return
    const name = draftNames[entryId] ?? ''
    setSavingEntryId(entryId)
    setError(null)
    try {
      await adminRenamePuzzleWeekEntry(CURRENT_PUZZLE_WEEK_EVENT.id, user, entryId, name)
      await loadAdminEntries(user)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not rename that team.')
    } finally {
      setSavingEntryId(null)
    }
  }

  async function handleReset(entryId: string, name: string) {
    if (!user) return
    if (!window.confirm(`Reset "${name}" and remove its registration, progress, and votes?`)) return
    setSavingEntryId(entryId)
    setError(null)
    try {
      await adminResetPuzzleWeekEntry(CURRENT_PUZZLE_WEEK_EVENT.id, user, entryId)
      await loadAdminEntries(user)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not reset that registration.')
    } finally {
      setSavingEntryId(null)
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string, entryName: string) {
    if (!user) return
    if (!window.confirm(`Remove ${memberName} from "${entryName}"? Their vote will also be removed.`)) return
    setSavingEntryId(memberId)
    setError(null)
    try {
      await adminRemovePuzzleWeekMember(CURRENT_PUZZLE_WEEK_EVENT.id, user, memberId)
      await loadAdminEntries(user)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not remove that team member.')
    } finally {
      setSavingEntryId(null)
    }
  }

  function handleExportCsv() {
    const rows: (string | number)[][] = [
      [
        'entry_name',
        'entry_type',
        'join_code',
        'participant_name',
        'participant_email',
        'correct_responses',
        'solved_puzzles',
      ],
    ]

    for (const item of filteredEntries) {
      const solvedTitles = item.solvedPuzzleIds
        .map(id => PUZZLE_TITLE_BY_ID.get(id) ?? id)
        .join(' | ')

      for (const member of item.members) {
        rows.push([
          item.entry.name,
          item.entry.type,
          item.entry.joinCode ?? '',
          member.displayName || '',
          member.email || '',
          item.solvedCount,
          solvedTitles,
        ])
      }
    }

    downloadCsv(rows, 'puzzle-week-2026-admin-export.csv')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="https://puzzleweek.abrastat.com" className="shrink-0">
              <img
                src="/logo.svg"
                alt="AbraStat"
                className="h-auto w-32"
              />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted)]">Admin</p>
              <h1 className="text-3xl font-semibold text-[var(--color-text)]">Puzzle Week Control Panel</h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Search registrations, rename teams, and reset entries when something needs intervention.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="https://puzzleweek.abrastat.com"
              className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
            >
              Open Puzzle Week
            </Link>
            {user && !isGuest && (
              <button
                onClick={() => void signOut()}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[var(--color-border)] bg-white p-8 text-sm text-[var(--color-muted)] shadow-sm">
            Loading…
          </div>
        ) : !user || isGuest ? (
          <div className="mx-auto max-w-md rounded-3xl border border-[var(--color-border)] bg-white p-8 text-center shadow-sm">
            <Shield className="mx-auto h-8 w-8 text-[var(--color-accent)]" />
            <h2 className="mt-4 text-xl font-semibold text-[var(--color-text)]">Sign in to open admin tools</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Use an approved Puzzle Week admin account.
            </p>
            <div className="mt-5 flex justify-center">
              <SignInButton googleOnly />
            </div>
          </div>
        ) : !canManage ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-danger)] bg-[var(--color-danger-light)] p-8 text-center shadow-sm">
            <AlertTriangle className="mx-auto h-8 w-8 text-[var(--color-danger)]" />
            <h2 className="mt-4 text-xl font-semibold text-[var(--color-danger)]">No admin access</h2>
            <p className="mt-2 text-sm text-[var(--color-danger)]">
              This account can use Puzzle Week, but it is not allowed to manage registrations.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard label="Entries" value={summary.total} />
              <SummaryCard label="Teams" value={summary.teamCount} />
              <SummaryCard label="Solos" value={summary.soloCount} />
              <div className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
                <label className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] px-4 py-3">
                  <Search className="h-4 w-4 text-[var(--color-muted)]" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, member, email, join code"
                    className="w-full bg-transparent text-sm text-[var(--color-text)] outline-none"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-light)] px-4 py-3 text-sm text-[var(--color-danger)]">
                {error}
              </div>
            )}

            <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Registrations</h2>
                  <p className="text-sm text-[var(--color-muted)]">
                    {filteredEntries.length} of {entries.length} shown
                  </p>
                </div>
                <button
                  onClick={() => user && void loadAdminEntries(user)}
                  disabled={loadingEntries}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:opacity-60"
                >
                  <RotateCcw className={`h-4 w-4 ${loadingEntries ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={handleExportCsv}
                  disabled={filteredEntries.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--color-muted)]">
                  No registrations match that search.
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {filteredEntries.map(item => {
                    const solvedTitles = item.solvedPuzzleIds.map(id => PUZZLE_TITLE_BY_ID.get(id) ?? id)
                    const isSaving = savingEntryId === item.entry.id
                    return (
                      <div key={item.entry.id} className="px-6 py-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-semibold text-[var(--color-text)]">{item.entry.name}</h3>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                                item.entry.type === 'team'
                                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-strong)]'
                                  : 'bg-[var(--color-bg)] text-[var(--color-text)]'
                              }`}>
                                {item.entry.type}
                              </span>
                              {item.entry.joinCode && (
                                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs font-semibold tracking-[0.2em] text-[var(--color-text)]">
                                  {item.entry.joinCode}
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.members.map(member => (
                                <div
                                  key={member.id}
                                  className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)]"
                                >
                                  <span>
                                    <span className="font-medium">{member.displayName || member.email || member.userId}</span>
                                    {member.email && <span className="text-[var(--color-muted)]"> · {member.email}</span>}
                                  </span>
                                  <button
                                    onClick={() => void handleRemoveMember(
                                      member.id,
                                      member.displayName || member.email || member.userId,
                                      item.entry.name,
                                    )}
                                    disabled={savingEntryId === member.id}
                                    className="rounded-full border border-[var(--color-danger)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-danger)] transition hover:bg-[var(--color-danger-light)] disabled:opacity-60"
                                  >
                                    {savingEntryId === member.id ? 'Removing…' : 'Remove'}
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--color-muted)]">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
                                {item.solvedCount} solved
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-[var(--color-accent)]" />
                                {item.members.length} member{item.members.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {solvedTitles.length > 0 ? solvedTitles.map(title => (
                                <span
                                  key={title}
                                  className="rounded-full bg-[var(--color-accent-light)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-strong)]"
                                >
                                  {title}
                                </span>
                              )) : (
                                <span className="text-sm text-[var(--color-muted)]">No puzzles solved yet.</span>
                              )}
                            </div>
                          </div>

                          <div className="w-full max-w-md space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                            {item.entry.type === 'team' ? (
                              <>
                                <div>
                                  <label className="mb-1 block text-xs font-mono font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                                    Rename team
                                  </label>
                                  <input
                                    value={draftNames[item.entry.id] ?? ''}
                                    onChange={e => setDraftNames(current => ({ ...current, [item.entry.id]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        void handleRename(item.entry.id)
                                      }
                                    }}
                                    className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                                  />
                                </div>
                                <button
                                  onClick={() => void handleRename(item.entry.id)}
                                  disabled={isSaving}
                                  className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                                >
                                  {isSaving ? 'Saving…' : 'Save Team Name'}
                                </button>
                              </>
                            ) : (
                              <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-muted)]">
                                Solo entries don’t have editable team names.
                              </div>
                            )}

                            <button
                              onClick={() => void handleReset(item.entry.id, item.entry.name)}
                              disabled={isSaving}
                              className="w-full rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-light)] px-4 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[var(--color-danger-light)] disabled:opacity-60"
                            >
                              {isSaving ? 'Resetting…' : 'Reset Registration'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  )
}
