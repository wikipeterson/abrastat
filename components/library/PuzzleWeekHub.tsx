'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Calendar, CheckCircle2, RefreshCw, Trophy, User, UserPlus, Users } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'
import { signOut } from '@/lib/auth'
import { canDownloadPuzzleWeekPacketIdentity, canRegisterForPuzzleWeek, canResetPuzzleWeekRegistrationIdentity, getPuzzleWeekEligibilityMessage, getPuzzleWeekPacketMessage } from '@/lib/featureFlags'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  PUZZLE_WEEK_MAX_TEAM_SIZE,
  PUZZLE_WEEK_PUZZLES,
  PuzzleWeekAnswerResult,
  PuzzleWeekEntry,
  PuzzleWeekLeaderboardEntry,
  PuzzleWeekMember,
  PuzzleWeekProgress,
  PuzzleWeekPuzzle,
  PuzzleWeekVote,
  PuzzleWeekVoteTally,
  downloadPuzzleWeekPacket,
  getPuzzleWeekLeaderboard,
  getPuzzleWeekProgress,
  getPuzzleWeekRegistration,
  getPuzzleWeekVoteData,
  joinPuzzleWeekTeam,
  registerPuzzleWeekSolo,
  registerPuzzleWeekTeam,
  resetPuzzleWeekRegistration,
  submitPuzzleWeekAnswer,
  submitPuzzleWeekVote,
} from '@/lib/puzzleWeek'

type RegisterMode = 'solo' | 'create-team' | 'join-team' | null

const MAIN_PUZZLES = PUZZLE_WEEK_PUZZLES.slice(0, PUZZLE_WEEK_PUZZLES.length - 1)
const META_PUZZLE = PUZZLE_WEEK_PUZZLES[PUZZLE_WEEK_PUZZLES.length - 1]

export function PuzzleWeekHub() {
  const { user, loading, isGuest } = useAuth()
  const [entry, setEntry] = useState<PuzzleWeekEntry | null>(null)
  const [members, setMembers] = useState<PuzzleWeekMember[]>([])
  const [registerMode, setRegisterMode] = useState<RegisterMode>(null)
  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [puzzleAnswers, setPuzzleAnswers] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<Record<string, PuzzleWeekProgress>>({})
  const [answerMessages, setAnswerMessages] = useState<Record<string, PuzzleWeekAnswerResult | undefined>>({})
  const [checkingPuzzleId, setCheckingPuzzleId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingRegistration, setLoadingRegistration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<PuzzleWeekLeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [showJoinTeam, setShowJoinTeam] = useState(false)
  const [downloadingPacket, setDownloadingPacket] = useState(false)
  const [myVote, setMyVote] = useState<PuzzleWeekVote>({ easiest: null, hardest: null, favorite: null })
  const [voteTally, setVoteTally] = useState<PuzzleWeekVoteTally | null>(null)
  const [savingVote, setSavingVote] = useState(false)
  const [voteSaved, setVoteSaved] = useState(false)
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number; started: boolean; ended: boolean } | null>(null)
  const canRegister = canRegisterForPuzzleWeek(user)
  const canDownloadPacket = canDownloadPuzzleWeekPacketIdentity(user)
  const canResetRegistration = canResetPuzzleWeekRegistrationIdentity(user)
  const eligibilityMessage = getPuzzleWeekEligibilityMessage()
  const packetMessage = getPuzzleWeekPacketMessage(user)
  const solvedCount = Object.values(progress).filter(p => p.solved).length

  function getErrorMessage(err: unknown, fallback: string) {
    return err instanceof Error && err.message ? err.message : fallback
  }

  async function refreshRegistration(currentUser: NonNullable<typeof user>) {
    setLoadingRegistration(true)
    setError(null)
    try {
      const registration = await getPuzzleWeekRegistration(CURRENT_PUZZLE_WEEK_EVENT.id, currentUser)
      setEntry(registration.entry)
      setMembers(registration.members)
    } catch (err) {
      setError(getErrorMessage(err, 'We couldn’t load your Puzzle Week registration right now.'))
    } finally {
      setLoadingRegistration(false)
    }
  }

  async function loadLeaderboard(currentUser?: NonNullable<typeof user> | null) {
    setLoadingLeaderboard(true)
    try {
      const data = await getPuzzleWeekLeaderboard(CURRENT_PUZZLE_WEEK_EVENT.id, currentUser)
      setLeaderboard(data)
    } catch {
      // best-effort
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setEntry(null)
      setMembers([])
      setProgress({})
      setPuzzleAnswers({})
      setAnswerMessages({})
      return
    }
    void refreshRegistration(user)
  }, [user])

  useEffect(() => {
    if (!entry) {
      setProgress({})
      setAnswerMessages({})
      return
    }
    const entryId = entry.id
    let cancelled = false
    async function loadProgress() {
      try {
        if (!user) return
        const solved = await getPuzzleWeekProgress(CURRENT_PUZZLE_WEEK_EVENT.id, user)
        if (cancelled) return
        const next: Record<string, PuzzleWeekProgress> = {}
        solved.forEach(item => { next[item.puzzleId] = item })
        setProgress(next)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'We couldn’t load your puzzle progress right now.'))
      }
    }
    void loadProgress()
    return () => { cancelled = true }
  }, [entry, user])

  useEffect(() => { void loadLeaderboard(user) }, [user])

  async function loadVotes(currentUser: typeof user) {
    try {
      const data = await getPuzzleWeekVoteData(CURRENT_PUZZLE_WEEK_EVENT.id, isGuest ? null : currentUser)
      setVoteTally(data.tally)
      if (data.myVote) setMyVote(data.myVote)
    } catch { /* best-effort */ }
  }

  useEffect(() => { void loadVotes(user) }, [user])

  async function handleSaveVote() {
    if (!user || isGuest) return
    setSavingVote(true)
    setError(null)
    try {
      await submitPuzzleWeekVote(CURRENT_PUZZLE_WEEK_EVENT.id, user, myVote)
      setVoteSaved(true)
      setTimeout(() => setVoteSaved(false), 3000)
      void loadVotes(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save your vote.'))
    } finally {
      setSavingVote(false)
    }
  }

  useEffect(() => {
    const START = new Date('2026-05-18T00:00:00')
    const END = new Date('2026-05-26T23:59:00')
    function compute() {
      const now = new Date()
      if (now >= END) return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true, ended: true }
      const target = now < START ? START : END
      const started = now >= START
      const diff = target.getTime() - now.getTime()
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        started,
        ended: false,
      }
    }
    setCountdown(compute())
    const id = setInterval(() => setCountdown(compute()), 1000)
    return () => clearInterval(id)
  }, [])

  async function handleSolo() {
    if (!user) return
    setSubmitting(true)
    setError(null)
    try {
      await registerPuzzleWeekSolo(CURRENT_PUZZLE_WEEK_EVENT.id, user)
      await refreshRegistration(user)
      setRegisterMode(null)
      void loadLeaderboard(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register solo.'))
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
      await refreshRegistration(user)
      setRegisterMode(null)
      setTeamName('')
      void loadLeaderboard(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create your team.'))
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
      await refreshRegistration(user)
      setRegisterMode(null)
      setJoinCode('')
      setShowJoinTeam(false)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not join that team.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    setError(null)
    await signOut()
  }

  async function handleResetRegistration() {
    if (!user) return
    if (!window.confirm('Reset your current Puzzle Week registration and progress? This cannot be undone.')) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await resetPuzzleWeekRegistration(CURRENT_PUZZLE_WEEK_EVENT.id, user)
      setEntry(null)
      setMembers([])
      setProgress({})
      setPuzzleAnswers({})
      setAnswerMessages({})
      setRegisterMode(null)
      setShowJoinTeam(false)
      setTeamName('')
      setJoinCode('')
      await refreshRegistration(user)
      void loadLeaderboard(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset your registration.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCheckAnswer(puzzleId: string) {
    if (!entry || !user) return
    setCheckingPuzzleId(puzzleId)
    setError(null)
    try {
      const result = await submitPuzzleWeekAnswer(
        CURRENT_PUZZLE_WEEK_EVENT.id,
        user,
        puzzleId,
        puzzleAnswers[puzzleId] ?? '',
      )
      setAnswerMessages(current => ({ ...current, [puzzleId]: result }))
      if (result.correct) {
        const solved = await getPuzzleWeekProgress(CURRENT_PUZZLE_WEEK_EVENT.id, user)
        const next: Record<string, PuzzleWeekProgress> = {}
        solved.forEach(item => { next[item.puzzleId] = item })
        setProgress(next)
        setPuzzleAnswers(current => ({ ...current, [puzzleId]: '' }))
        void loadLeaderboard(user)
      }
    } catch (err) {
      setAnswerMessages(current => ({
        ...current,
        [puzzleId]: {
          correct: false,
          message: getErrorMessage(err, 'Could not check that answer.'),
        },
      }))
    } finally {
      setCheckingPuzzleId(null)
    }
  }

  async function handleDownloadPacket() {
    if (!user) {
      setError('Sign in to download the puzzle pack.')
      return
    }
    setDownloadingPacket(true)
    setError(null)
    try {
      await downloadPuzzleWeekPacket(user)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not download the puzzle pack.'))
    } finally {
      setDownloadingPacket(false)
    }
  }

  if (loading || loadingRegistration) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="h-10 w-10 rounded-full border-4 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </main>
    )
  }

  const mainPuzzlesSolvedCount = Object.values(progress).filter(
    p => p.solved && MAIN_PUZZLES.some(mp => mp.id === p.puzzleId)
  ).length

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 sm:py-8" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">

        {/* ── Mobile header: stacked ── */}
        <div className="sm:hidden space-y-3">
          <div className="flex items-center justify-between">
            <Link href="/home" className="select-none" aria-label="Return to AbraStat">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" style={{ width: '150px', height: 'auto' }} />
            </Link>
            {user && !isGuest && (
              <button
                onClick={handleSignOut}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Sign out
              </button>
            )}
          </div>
          <div className="text-center space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              HHS Math Department Presents
            </p>
            <h1
              className="text-3xl font-semibold leading-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              Puzzle Week 2026
            </h1>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
              <Calendar className="h-3 w-3" />
              May 18 – 26, 2026
            </div>
          </div>
        </div>

        {/* ── Desktop header: logo | absolute-center title | sign out ── */}
        <div className="hidden sm:flex relative items-center py-2">
          <Link href="/home" className="relative z-10 flex-shrink-0 select-none" aria-label="Return to AbraStat">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(200px, 24vw, 320px)', height: 'auto' }} />
          </Link>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              HHS Math Department Presents
            </p>
            <h1
              className="mt-1 whitespace-nowrap text-4xl sm:text-5xl font-semibold leading-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              Puzzle Week 2026
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
              <Calendar className="h-3 w-3" />
              Monday, May 18 – Tuesday, May 26, 2026
            </div>
          </div>
          {user && !isGuest && (
            <button
              onClick={handleSignOut}
              className="relative z-10 ml-auto flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
            >
              Sign out
            </button>
          )}
        </div>

        {/* Countdown — only shown before May 18 */}
        {countdown && !countdown.started && !countdown.ended && (
          <div className="text-center pt-4 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Opens in
            </p>
            <div className="flex items-end justify-center gap-2 sm:gap-3">
              {([
                { value: countdown.days, label: 'days' },
                { value: countdown.hours, label: 'hrs' },
                { value: countdown.minutes, label: 'min' },
                { value: countdown.seconds, label: 'sec' },
              ] as const).map(({ value, label }) => (
                <div key={label} className="flex flex-col items-center">
                  <div className="flex min-w-[3rem] items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-2xl font-bold tabular-nums text-[var(--color-text)] shadow-sm">
                    {String(value).padStart(2, '0')}
                  </div>
                  <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entry && (
          <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-white/70 px-4 sm:px-7 py-4 sm:py-5 shadow-sm">
            <ul className="space-y-2 text-sm text-[var(--color-muted)] leading-relaxed">
              {([
                <>
                  <button
                    type="button"
                    onClick={handleDownloadPacket}
                    disabled={!canDownloadPacket || downloadingPacket}
                    className={`font-semibold underline underline-offset-4 transition ${
                      canDownloadPacket
                        ? 'text-[var(--color-accent)] hover:opacity-80'
                        : 'cursor-not-allowed text-[var(--color-muted)] decoration-dotted'
                    }`}
                    title={packetMessage ?? 'Download the puzzle pack'}
                  >
                    {downloadingPacket ? 'Downloading puzzle pack…' : 'Download the puzzle pack here.'}
                  </button>
                  {packetMessage && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {packetMessage}
                    </span>
                  )}
                </>,
                <>This packet contains <strong className="text-[var(--color-text)]">7 puzzles</strong>. Puzzles 1–6 are independent. Puzzle 7 is a <strong className="text-[var(--color-text)]">metapuzzle</strong> that uses the answers from the first six.</>,
                <>Each answer is a <strong className="text-[var(--color-text)]">single word, name, or short phrase</strong> in English.</>,
                <>You may use <strong className="text-[var(--color-text)]">any resources</strong>, including the internet.</>,
                <>Compete <strong className="text-[var(--color-text)]">solo or as a team</strong> of up to {PUZZLE_WEEK_MAX_TEAM_SIZE}. Please don&apos;t share answers with other teams.</>,
                <>Check answers individually as you go. Submit by <strong className="text-[var(--color-text)]">23:59 on Tuesday, May 26, 2026</strong>. Double-check for typos.</>,
              ] as ReactNode[]).map((text, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Auth / registration states ── */}
        {!user || isGuest ? (
          <div className="mx-auto max-w-sm rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center space-y-4">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Sign in to register</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Use your Haverford School District Google account to join.
            </p>
            <div className="flex justify-center">
              <SignInButton googleOnly />
            </div>
          </div>
        ) : !canRegister ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-sm text-center space-y-3">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Registration limited</h2>
            <p className="text-sm text-[var(--color-muted)]">{eligibilityMessage}</p>
            <p className="text-sm text-[var(--color-muted)]">
              Signed in as{' '}
              <span className="font-semibold text-[var(--color-text)]">
                {user.email ?? user.displayName ?? 'this account'}
              </span>
              . If you have a Haverford School District account, sign out and sign back in with that address.
            </p>
          </div>
        ) : entry ? (
          <div className="space-y-6">

            {/* Entry header card */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                    {entry.type === 'team' ? 'Team Entry' : 'Solo Entry'}
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{entry.name}</h2>
                  {entry.joinCode && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--color-muted)]">Join code</span>
                      <code className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-mono text-sm font-semibold tracking-widest text-[var(--color-text)]">
                        {entry.joinCode}
                      </code>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-3xl font-bold text-[var(--color-text)]">
                    {solvedCount}
                    <span className="text-lg font-medium text-[var(--color-muted)]">/{PUZZLE_WEEK_PUZZLES.length}</span>
                  </div>
                  <div className="text-xs font-medium text-[var(--color-muted)]">puzzles solved</div>
                  {canResetRegistration && (
                    <button
                      onClick={handleResetRegistration}
                      disabled={submitting}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      Reset Registration
                    </button>
                  )}
                </div>
              </div>

              {/* Progress track */}
              <div className="px-6 pb-5">
                <div className="flex gap-1.5">
                  {PUZZLE_WEEK_PUZZLES.map((puzzle, i) => {
                    const solved = progress[puzzle.id]?.solved === true
                    const isMeta = i === PUZZLE_WEEK_PUZZLES.length - 1
                    return (
                      <div
                        key={puzzle.id}
                        title={puzzle.title}
                        className={`h-8 flex-1 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                          solved
                            ? isMeta
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-500 text-white'
                            : 'bg-[var(--color-accent-light)] text-[var(--color-muted)]'
                        }`}
                      >
                        {isMeta ? 'M' : i + 1}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Team members */}
              {entry.type === 'team' && members.length > 0 && (
                <div className="border-t border-[var(--color-border)] px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    {members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)]"
                      >
                        <User className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                        {member.displayName || member.email || member.userId}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Solo → join a team */}
            {entry.type === 'solo' && (
              <div className="rounded-3xl border border-[var(--color-border)] bg-white/60 px-6 py-4">
                {registerMode === 'create-team' ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">Create a team</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        Pick a team name and we&apos;ll move your registration onto the new team.
                      </p>
                    </div>
                    <input
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleCreateTeam()
                        }
                      }}
                      placeholder="Team name"
                      className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleCreateTeam}
                        disabled={submitting}
                        className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                      >
                        {submitting ? 'Creating…' : 'Create Team'}
                      </button>
                      <button
                        onClick={() => {
                          setRegisterMode(null)
                          setTeamName('')
                        }}
                        className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-accent)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : !showJoinTeam ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">Want to create or join a team?</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        Start a new team and share its join code, or enter a join code to move your registration onto an existing team.
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <button
                        onClick={() => {
                          setRegisterMode('create-team')
                          setShowJoinTeam(false)
                          setError(null)
                        }}
                        className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
                      >
                        Create Team
                      </button>
                      <button
                        onClick={() => setShowJoinTeam(true)}
                        className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
                      >
                        Join a Team
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[var(--color-text)]">Enter the team join code</p>
                    <div className="flex gap-2">
                      <input
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABC123"
                        className="flex-1 min-w-0 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-center text-base tracking-[0.25em] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      />
                      <button
                        onClick={handleJoinTeam}
                        disabled={submitting}
                        className="flex-shrink-0 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                      >
                        {submitting ? 'Joining…' : 'Join'}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowJoinTeam(false)
                        setJoinCode('')
                      }}
                      className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-accent)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Puzzles 1–6 */}
            <div>
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                Puzzles 1–6
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {MAIN_PUZZLES.map((puzzle, index) => (
                  <PuzzleCard
                    key={puzzle.id}
                    puzzle={puzzle}
                    index={index}
                    solved={progress[puzzle.id]?.solved === true}
                    answer={puzzleAnswers[puzzle.id] ?? ''}
                    answerMessage={answerMessages[puzzle.id]}
                    checking={checkingPuzzleId === puzzle.id}
                    onAnswerChange={value => {
                      setPuzzleAnswers(current => ({ ...current, [puzzle.id]: value }))
                      setAnswerMessages(current => ({ ...current, [puzzle.id]: undefined }))
                    }}
                    onCheck={() => handleCheckAnswer(puzzle.id)}
                  />
                ))}
              </div>
            </div>

            {/* Metapuzzle */}
            <div>
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                Metapuzzle
              </h3>
              <MetaPuzzleCard
                puzzle={META_PUZZLE}
                solved={progress[META_PUZZLE.id]?.solved === true}
                answer={puzzleAnswers[META_PUZZLE.id] ?? ''}
                answerMessage={answerMessages[META_PUZZLE.id]}
                checking={checkingPuzzleId === META_PUZZLE.id}
                mainPuzzlesSolvedCount={mainPuzzlesSolvedCount}
                onAnswerChange={value => {
                  setPuzzleAnswers(current => ({ ...current, [META_PUZZLE.id]: value }))
                  setAnswerMessages(current => ({ ...current, [META_PUZZLE.id]: undefined }))
                }}
                onCheck={() => handleCheckAnswer(META_PUZZLE.id)}
              />
            </div>
          </div>
        ) : (
          /* Registration choice */
          <div className="space-y-6">
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
              <ChoiceCard
                icon={<User className="h-5 w-5" />}
                title="Play Solo"
                body="Compete on your own. You can still join a team later."
                active={registerMode === 'solo'}
                onClick={() => { setRegisterMode('solo'); setError(null) }}
              />
              <ChoiceCard
                icon={<Users className="h-5 w-5" />}
                title="Create Team"
                body={`Start a team and share a join code. Up to ${PUZZLE_WEEK_MAX_TEAM_SIZE} members.`}
                active={registerMode === 'create-team'}
                onClick={() => { setRegisterMode('create-team'); setError(null) }}
              />
              <ChoiceCard
                icon={<UserPlus className="h-5 w-5" />}
                title="Join Team"
                body="Enter a teammate's join code to register under their team."
                active={registerMode === 'join-team'}
                onClick={() => { setRegisterMode('join-team'); setError(null) }}
              />
            </div>

            <div className="mx-auto max-w-md rounded-3xl border border-[var(--color-border)] bg-white p-7 shadow-sm">

              {registerMode === 'solo' && (
                <div className="space-y-4 text-center">
                  <h3 className="text-lg font-semibold text-[var(--color-text)]">Register Solo</h3>
                  <p className="text-sm text-[var(--color-muted)]">
                    Creates one entry tied to your account. You can join a team later.
                  </p>
                  <button
                    onClick={handleSolo}
                    disabled={submitting}
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {submitting ? 'Registering…' : 'Confirm Solo Registration'}
                  </button>
                </div>
              )}

              {registerMode === 'create-team' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-[var(--color-text)]">Create a Team</h3>
                    <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                      Pick a team name — we&apos;ll generate a join code to share with teammates.
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
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {submitting ? 'Creating…' : 'Create Team'}
                  </button>
                </div>
              )}

              {registerMode === 'join-team' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-[var(--color-text)]">Join a Team</h3>
                    <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                      Enter the 6-character join code from your teammate.
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
                    className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {submitting ? 'Joining…' : 'Join Team'}
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

        {/* ── Community Poll ── */}
        <div className="space-y-5 border-t border-[var(--color-border)] pt-8">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">🗳️</span>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Community Poll</h2>
            {voteTally && voteTally.totalVoters > 0 && (
              <span className="text-sm text-[var(--color-muted)]">
                {voteTally.totalVoters} {voteTally.totalVoters === 1 ? 'voter' : 'voters'}
              </span>
            )}
          </div>

          {/* Vote form — registered users only */}
          {entry && (
            <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm space-y-4">
              <p className="text-sm text-[var(--color-muted)]">
                Share your take on this year&apos;s puzzles. You can change your votes at any time.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {([
                  { key: 'easiest', label: '😌 Easiest' },
                  { key: 'hardest', label: '🤯 Hardest' },
                  { key: 'favorite', label: '⭐ Favorite' },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
                      {label}
                    </label>
                    <select
                      value={myVote[key] ?? ''}
                      onChange={e => setMyVote(v => ({ ...v, [key]: e.target.value || null }))}
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                      <option value="">— no vote —</option>
                      {PUZZLE_WEEK_PUZZLES.map(puzzle => (
                        <option key={puzzle.id} value={puzzle.id}>{puzzle.title}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveVote}
                  disabled={savingVote}
                  className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {savingVote ? 'Saving…' : 'Save Votes'}
                </button>
                {voteSaved && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Results charts */}
          {voteTally && (
            <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
              <div className="grid gap-8 sm:grid-cols-3">
                <VoteBarChart label="😌 Easiest Puzzle" tally={voteTally.easiest} myVotedId={myVote.easiest} />
                <VoteBarChart label="🤯 Hardest Puzzle" tally={voteTally.hardest} myVotedId={myVote.hardest} />
                <VoteBarChart label="⭐ Favorite Puzzle" tally={voteTally.favorite} myVotedId={myVote.favorite} />
              </div>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="space-y-4 border-t border-[var(--color-border)] pt-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Trophy className="h-5 w-5 text-[var(--color-accent)]" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Leaderboard</h2>
              {!loadingLeaderboard && (
                <span className="text-sm text-[var(--color-muted)]">
                  {leaderboard.length} {leaderboard.length === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>
            <button
              onClick={() => { void loadLeaderboard(user) }}
              disabled={loadingLeaderboard}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-accent)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLeaderboard ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            {loadingLeaderboard ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--color-muted)]">
                No entries yet — register and start solving to appear here!
              </div>
            ) : (
              leaderboard.map((lb, i) => {
                const isMe = lb.entryId === entry?.id
                const rank = i + 1
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                return (
                  <div
                    key={lb.entryId}
                    className={`flex items-center gap-2 sm:gap-4 border-b px-3 sm:px-5 py-3 sm:py-3.5 last:border-b-0 border-[var(--color-border)] transition-colors ${
                      isMe ? 'bg-[var(--color-accent-light)]/40' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="w-7 flex-shrink-0 text-center">
                      {medal ? (
                        <span className="text-base leading-none">{medal}</span>
                      ) : (
                        <span className="text-sm font-semibold text-[var(--color-muted)]">{rank}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate font-semibold ${isMe ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                          {lb.name}
                        </span>
                        {isMe && (
                          <span className="flex-shrink-0 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                            you
                          </span>
                        )}
                      </div>
                      {lb.type === 'team' && lb.memberNames.length > 0 && (
                        <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                          {lb.memberNames.join(', ')}
                        </div>
                      )}
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      lb.type === 'team'
                        ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {lb.type === 'team' ? 'Team' : 'Solo'}
                    </span>
                    <div className="hidden flex-shrink-0 gap-1 sm:flex">
                      {PUZZLE_WEEK_PUZZLES.map((puzzle, pi) => {
                        const isMeta = pi === PUZZLE_WEEK_PUZZLES.length - 1
                        const solved = lb.solvedPuzzleIds.includes(puzzle.id)
                        return (
                          <div
                            key={puzzle.id}
                            title={puzzle.title}
                            className={`h-2.5 w-2.5 rounded-full transition-colors ${
                              solved
                                ? isMeta ? 'bg-amber-400' : 'bg-emerald-400'
                                : 'bg-[var(--color-border)]'
                            }`}
                          />
                        )
                      })}
                    </div>
                    <div className="w-10 flex-shrink-0 text-right text-sm font-semibold text-[var(--color-text)]">
                      {lb.solvedCount}
                      <span className="font-normal text-[var(--color-muted)]">/{PUZZLE_WEEK_PUZZLES.length}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
    </main>
  )
}

function VoteBarChart({
  label,
  tally,
  myVotedId,
}: {
  label: string
  tally: Record<string, number>
  myVotedId: string | null
}) {
  const counts = PUZZLE_WEEK_PUZZLES.map(p => tally[p.id] ?? 0)
  const maxCount = Math.max(1, ...counts)
  const total = counts.reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">{label}</h4>
        {total > 0 && (
          <span className="text-[10px] text-[var(--color-muted)]">{total} vote{total !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="space-y-1.5">
        {PUZZLE_WEEK_PUZZLES.map((puzzle, i) => {
          const count = tally[puzzle.id] ?? 0
          const pct = (count / maxCount) * 100
          const isMe = myVotedId === puzzle.id
          const isMeta = i === PUZZLE_WEEK_PUZZLES.length - 1
          const shortLabel = isMeta ? 'Meta' : `Day ${i + 1}`
          return (
            <div key={puzzle.id} className="flex items-center gap-2">
              <div className="w-10 flex-shrink-0 text-right text-[11px] font-semibold text-[var(--color-muted)]">
                {shortLabel}
              </div>
              <div className="relative flex-1 h-6 rounded-lg overflow-hidden bg-slate-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: isMe
                      ? isMeta ? 'rgb(245 158 11)' : 'var(--color-accent)'
                      : 'var(--color-border)',
                  }}
                />
                {isMe && count > 0 && (
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="text-[10px] font-semibold text-white leading-none">your vote</span>
                  </div>
                )}
              </div>
              <div className="w-4 flex-shrink-0 text-right text-xs font-semibold text-[var(--color-text)]">
                {count || ''}
              </div>
            </div>
          )
        })}
      </div>
      {total === 0 && (
        <p className="text-center text-xs text-[var(--color-muted)]">No votes yet.</p>
      )}
    </div>
  )
}

function ChoiceCard({
  icon,
  title,
  body,
  active,
  onClick,
}: {
  icon: ReactNode
  title: string
  body: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-3xl border bg-white p-6 text-left shadow-sm transition-all ${
        active
          ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20 shadow-md'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/60 hover:shadow-md'
      }`}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
      }`}>
        {icon}
      </div>
      <div className="text-base font-semibold text-[var(--color-text)]">{title}</div>
      <p className="mt-2 text-sm leading-5 text-[var(--color-muted)]">{body}</p>
    </button>
  )
}

function PuzzleCard({
  puzzle,
  index,
  solved,
  answer,
  answerMessage,
  checking,
  onAnswerChange,
  onCheck,
}: {
  puzzle: PuzzleWeekPuzzle
  index: number
  solved: boolean
  answer: string
  answerMessage: PuzzleWeekAnswerResult | undefined
  checking: boolean
  onAnswerChange: (value: string) => void
  onCheck: () => void
}) {
  const colonIdx = puzzle.title.indexOf(': ')
  const dayLabel = colonIdx !== -1 ? puzzle.title.slice(0, colonIdx) : null
  const puzzleName = colonIdx !== -1 ? puzzle.title.slice(colonIdx + 2) : puzzle.title

  return (
    <div className={`rounded-2xl border p-5 space-y-4 transition-colors ${
      solved
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-[var(--color-border)] bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
          solved
            ? 'bg-emerald-500 text-white'
            : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
        }`}>
          {solved ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
        </div>
        <div className="flex-1 min-w-0">
          {dayLabel && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {dayLabel}
            </div>
          )}
          <div className="text-sm font-semibold leading-snug text-[var(--color-text)]">{puzzleName}</div>
        </div>
      </div>

      {solved ? (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Solved
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={e => onAnswerChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onCheck() }}
              placeholder="Your answer"
              className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              onClick={onCheck}
              disabled={checking || !answer.trim()}
              className="flex-shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? '…' : 'Check'}
            </button>
          </div>
          {answerMessage && (
            <div className={`rounded-lg px-3 py-2 text-xs ${
              answerMessage.correct
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {answerMessage.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaPuzzleCard({
  puzzle,
  solved,
  answer,
  answerMessage,
  checking,
  mainPuzzlesSolvedCount,
  onAnswerChange,
  onCheck,
}: {
  puzzle: PuzzleWeekPuzzle
  solved: boolean
  answer: string
  answerMessage: PuzzleWeekAnswerResult | undefined
  checking: boolean
  mainPuzzlesSolvedCount: number
  onAnswerChange: (value: string) => void
  onCheck: () => void
}) {
  const colonIdx = puzzle.title.indexOf(': ')
  const puzzleName = colonIdx !== -1 ? puzzle.title.slice(colonIdx + 2) : puzzle.title

  return (
    <div className={`rounded-2xl border p-6 transition-colors ${
      solved
        ? 'border-amber-300 bg-amber-50'
        : 'border-amber-200/70 bg-amber-50/40'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-base font-bold transition-colors ${
          solved ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'
        }`}>
          {solved ? <CheckCircle2 className="h-5 w-5" /> : '★'}
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Metapuzzle</div>
          <div className="mt-0.5 text-base font-semibold leading-snug text-[var(--color-text)]">{puzzleName}</div>
          {!solved && mainPuzzlesSolvedCount < MAIN_PUZZLES.length && (
            <p className="mt-1.5 text-xs text-amber-700">
              Uses the answers from puzzles 1–6. ({mainPuzzlesSolvedCount}/{MAIN_PUZZLES.length} solved so far)
            </p>
          )}
        </div>
      </div>

      {solved ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Solved — congratulations!
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={e => onAnswerChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onCheck() }}
              placeholder="Your metapuzzle answer"
              className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={onCheck}
              disabled={checking || !answer.trim()}
              className="flex-shrink-0 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {checking ? '…' : 'Check'}
            </button>
          </div>
          {answerMessage && (
            <div className={`rounded-lg px-3 py-2 text-xs ${
              answerMessage.correct
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {answerMessage.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
