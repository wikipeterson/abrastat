'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'
import { signOut } from '@/lib/auth'
import { canRegisterForPuzzleWeek, getPuzzleWeekEligibilityMessage } from '@/lib/featureFlags'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  PUZZLE_WEEK_MAX_TEAM_SIZE,
  PuzzleWeekEntry,
  PuzzleWeekMember,
  getPuzzleWeekRegistration,
  joinPuzzleWeekTeam,
  registerPuzzleWeekSolo,
  registerPuzzleWeekTeam,
} from '@/lib/puzzleWeek'

type RegisterMode = 'solo' | 'create-team' | 'join-team' | null

export function PuzzleWeekHub() {
  const { user, loading, isGuest } = useAuth()
  const [entry, setEntry] = useState<PuzzleWeekEntry | null>(null)
  const [members, setMembers] = useState<PuzzleWeekMember[]>([])
  const [registerMode, setRegisterMode] = useState<RegisterMode>(null)
  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingRegistration, setLoadingRegistration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canRegister = canRegisterForPuzzleWeek(user)
  const eligibilityMessage = getPuzzleWeekEligibilityMessage()

  async function refreshRegistration(currentUserId: string) {
    setLoadingRegistration(true)
    setError(null)
    try {
      const registration = await getPuzzleWeekRegistration(CURRENT_PUZZLE_WEEK_EVENT.id, currentUserId)
      setEntry(registration.entry)
      setMembers(registration.members)
    } catch {
      setError('We couldn’t load your Puzzle Week registration right now.')
    } finally {
      setLoadingRegistration(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setEntry(null)
      setMembers([])
      return
    }
    void refreshRegistration(user.uid)
  }, [user])

  async function handleSolo() {
    if (!user) return
    setSubmitting(true)
    setError(null)
    try {
      await registerPuzzleWeekSolo(CURRENT_PUZZLE_WEEK_EVENT.id, user)
      await refreshRegistration(user.uid)
      setRegisterMode(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register solo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateTeam() {
    if (!user) return
    setSubmitting(true)
    setError(null)
    try {
      await registerPuzzleWeekTeam(CURRENT_PUZZLE_WEEK_EVENT.id, user, teamName)
      await refreshRegistration(user.uid)
      setRegisterMode(null)
      setTeamName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your team.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoinTeam() {
    if (!user) return
    setSubmitting(true)
    setError(null)
    try {
      await joinPuzzleWeekTeam(CURRENT_PUZZLE_WEEK_EVENT.id, user, joinCode)
      await refreshRegistration(user.uid)
      setRegisterMode(null)
      setJoinCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that team.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    setError(null)
    await signOut()
  }

  if (loading || loadingRegistration) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
        <div className="h-10 w-10 rounded-full border-4 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen px-6 py-12" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <Link href="/home" className="flex-shrink-0 select-none" aria-label="Return to AbraStat">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(185px, 22vw, 290px)', height: 'auto' }} />
          </Link>
          <div className="flex-1 space-y-3 pt-1 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            Haverford Math Teachers Present
          </div>
          <h1 className="text-4xl font-semibold text-[var(--color-text)]">Puzzle Week 2026</h1>
          <div className="text-lg font-medium text-[var(--color-text)]">Monday, May 18 - Tuesday, May 26, 2026</div>
          <div className="mx-auto max-w-3xl space-y-3 text-base text-[var(--color-muted)]">
            <p>
              This packet contains 7 puzzles. The first 6 puzzles are independent of one another. The final puzzle is a metapuzzle, which means it uses the answers from the other 6 puzzles.
            </p>
            <p>
              The answer to each puzzle is a single word, name, or short phrase in English.
            </p>
            <p>
              You may use the internet and any other resources available to you, including artificial intelligence (AI).
            </p>
            <p>
              These puzzles are designed to be collaborative. You may compete solo or as a team of up to {PUZZLE_WEEK_MAX_TEAM_SIZE} people. Please do not share answers with other teams.
            </p>
          </div>
          </div>
          <div className="w-[clamp(185px,22vw,290px)] flex-shrink-0 flex justify-end">
            {user && !isGuest ? (
              <button
                onClick={handleSignOut}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Sign out
              </button>
            ) : (
              <div aria-hidden="true" />
            )}
          </div>
        </div>

        {!user || isGuest ? (
          <div className="mx-auto max-w-md rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
            <div className="mb-4 text-center">
              <h2 className="text-xl font-semibold text-[var(--color-text)]">Sign in to register</h2>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Sign in with your Haverford School District Google account to register.
              </p>
            </div>
            <div className="flex justify-center">
              <SignInButton googleOnly />
            </div>
          </div>
        ) : !canRegister ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-[var(--color-text)]">Puzzle Week registration is limited</h2>
              <p className="mt-3 text-base text-[var(--color-muted)]">{eligibilityMessage}</p>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                You’re signed in as <span className="font-semibold text-[var(--color-text)]">{user.email ?? user.displayName ?? 'this account'}</span>.
              </p>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                If you have a Haverford School District account, sign out and sign back in with that address.
              </p>
            </div>
          </div>
        ) : entry ? (
          <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-[var(--color-text)]">You’re registered</h2>
              <p className="mt-2 text-[var(--color-muted)]">
                Your Puzzle Week registration is active. This is the event shell we’ll build the puzzles and leaderboard into next.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Entry Type" value={entry.type === 'team' ? 'Team' : 'Solo'} />
              <StatCard label="Display Name" value={entry.name} />
              <StatCard label="Join Code" value={entry.joinCode ?? '—'} />
            </div>

            {entry.type === 'solo' && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-accent-light)]/30 p-5 space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-[var(--color-text)]">Want to join a team later?</h3>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    That’s okay. Enter a team’s join code below and we’ll move your solo registration onto that team.
                  </p>
                </div>
                <div className="mx-auto max-w-md space-y-3">
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-center text-base tracking-[0.25em] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    onClick={handleJoinTeam}
                    disabled={submitting}
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Joining Team…' : 'Join a Team'}
                  </button>
                </div>
              </div>
            )}

            {entry.type === 'team' && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-accent-light)]/40 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">Team Members</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {members.map(member => (
                    <div key={member.id} className="rounded-xl bg-white px-4 py-3 text-sm text-[var(--color-text)] border border-[var(--color-border)]">
                      {member.displayName || member.email || member.userId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="grid gap-5 lg:grid-cols-3">
              <ChoiceCard
                title="Play Solo"
                body="Compete on your own with one registration tied to your account. You can still join a team later."
                active={registerMode === 'solo'}
                onClick={() => {
                  setRegisterMode('solo')
                  setError(null)
                }}
              />
              <ChoiceCard
                title="Create Team"
                body={`Start a team, get a join code, and invite teammates. Teams may have up to ${PUZZLE_WEEK_MAX_TEAM_SIZE} members.`}
                active={registerMode === 'create-team'}
                onClick={() => {
                  setRegisterMode('create-team')
                  setError(null)
                }}
              />
              <ChoiceCard
                title="Join Team"
                body={`Enter a teammate’s join code to register under the same team entry, as long as the team has fewer than ${PUZZLE_WEEK_MAX_TEAM_SIZE} members.`}
                active={registerMode === 'join-team'}
                onClick={() => {
                  setRegisterMode('join-team')
                  setError(null)
                }}
              />
            </div>

            <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
              {registerMode === null && (
                <div className="text-center text-[var(--color-muted)]">
                  Choose how you want to register for Puzzle Week.
                </div>
              )}

              {registerMode === 'solo' && (
                <div className="space-y-4 text-center">
                  <h3 className="text-xl font-semibold text-[var(--color-text)]">Register Solo</h3>
                  <p className="text-sm text-[var(--color-muted)]">
                    This will create one Puzzle Week entry tied just to your AbraStat account. You can still join a team later.
                  </p>
                  <button
                    onClick={handleSolo}
                    disabled={submitting}
                    className="rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Registering…' : 'Confirm Solo Registration'}
                  </button>
                </div>
              )}

              {registerMode === 'create-team' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-[var(--color-text)]">Create a Team</h3>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                      Pick a team name. We’ll generate a join code you can share with teammates. Teams may have no more than {PUZZLE_WEEK_MAX_TEAM_SIZE} members.
                    </p>
                  </div>
                  <input
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="Team name"
                    className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={submitting}
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Creating Team…' : 'Create Team'}
                  </button>
                </div>
              )}

              {registerMode === 'join-team' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-[var(--color-text)]">Join a Team</h3>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                      Enter the 6-character team code from a teammate. You can join only if the team has fewer than {PUZZLE_WEEK_MAX_TEAM_SIZE} members.
                    </p>
                  </div>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-center text-base tracking-[0.25em] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    onClick={handleJoinTeam}
                    disabled={submitting}
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Joining Team…' : 'Join Team'}
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ChoiceCard({
  title,
  body,
  active,
  onClick,
}: {
  title: string
  body: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-3xl border bg-white p-6 text-left shadow-sm transition ${
        active
          ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent-light)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'
      }`}
    >
      <div className="text-xl font-semibold text-[var(--color-text)]">{title}</div>
      <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{body}</p>
    </button>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-accent-light)]/30 px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[var(--color-text)] break-words">{value}</div>
    </div>
  )
}
