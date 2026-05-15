'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Calendar, CheckCircle2, RefreshCw, Trophy, User, UserPlus, Users } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { PuzzleSignIn } from '@/components/library/PuzzleSignIn'
import { canDownloadPuzzleWeekPacketIdentity, canManagePuzzleWeekIdentity, canRegisterForPuzzleWeek, getPuzzleWeekEligibilityMessage, getPuzzleWeekPacketMessage } from '@/lib/featureFlags'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  PUZZLE_WEEK_MAX_TEAM_SIZE,
  PUZZLE_WEEK_PUZZLES,
  PuzzleWeekAnswerResult,
  PuzzleWeekBonusMedals,
  PuzzleWeekEntry,
  PuzzleWeekLeaderboardEntry,
  PuzzleWeekMember,
  PuzzleWeekProgress,
  PuzzleWeekPuzzle,
  PuzzleWeekVote,
  PuzzleWeekVoteTally,
  downloadPuzzleWeekPacket,
  getPuzzleWeekBonusMedals,
  getPuzzleWeekLeaderboard,
  getPuzzleWeekProgress,
  getPuzzleWeekRegistration,
  getPuzzleWeekVoteData,
  joinPuzzleWeekTeam,
  registerPuzzleWeekSolo,
  registerPuzzleWeekTeam,
  PuzzleWeek2048MedalLevel,
  PuzzleWeekBonusTier,
  submitPuzzleWeekAnswer,
  submitPuzzleWeekVote,
} from '@/lib/puzzleWeek'

type RegisterMode = 'solo' | 'create-team' | 'join-team' | null
type PuzzleBadge = 'easiest' | 'hardest' | 'favorite'

const BADGE_CONFIG: Record<PuzzleBadge, { label: string; className: string }> = {
  easiest:  { label: '😌 Easiest',  className: 'bg-sky-100 text-sky-700' },
  hardest:  { label: '🤯 Hardest',  className: 'bg-red-100 text-red-700' },
  favorite: { label: '⭐ Favorite', className: 'bg-amber-100 text-amber-700' },
}

function topVotedIds(tally: Record<string, number>): Set<string> {
  const entries = Object.entries(tally)
  if (!entries.length) return new Set()
  const max = Math.max(...entries.map(([, n]) => n))
  if (max === 0) return new Set()
  return new Set(entries.filter(([, n]) => n === max).map(([id]) => id))
}

const MAIN_PUZZLES = PUZZLE_WEEK_PUZZLES.slice(0, PUZZLE_WEEK_PUZZLES.length - 1)
const META_PUZZLE = PUZZLE_WEEK_PUZZLES[PUZZLE_WEEK_PUZZLES.length - 1]
const TOTAL_BONUS_MEDALS = 18
const BONUS_TIER_VALUES = new Set<PuzzleWeekBonusTier>(['easy', 'medium', 'hard'])
const BONUS_2048_VALUES = new Set<PuzzleWeek2048MedalLevel>(['bronze', 'silver', 'gold'])

function countBonusMedals(medals: PuzzleWeekBonusMedals) {
  return (
    new Set(medals.slider.filter((value): value is PuzzleWeekBonusTier => BONUS_TIER_VALUES.has(value as PuzzleWeekBonusTier))).size +
    new Set(medals.lightsOut.filter((value): value is PuzzleWeekBonusTier => BONUS_TIER_VALUES.has(value as PuzzleWeekBonusTier))).size +
    new Set(medals.netwalk.filter((value): value is PuzzleWeekBonusTier => BONUS_TIER_VALUES.has(value as PuzzleWeekBonusTier))).size +
    new Set(medals.game2048.filter((value): value is PuzzleWeek2048MedalLevel => BONUS_2048_VALUES.has(value as PuzzleWeek2048MedalLevel))).size +
    new Set(medals.queens.filter((value): value is PuzzleWeekBonusTier => BONUS_TIER_VALUES.has(value as PuzzleWeekBonusTier))).size +
    new Set(medals.starBattle.filter((value): value is PuzzleWeekBonusTier => BONUS_TIER_VALUES.has(value as PuzzleWeekBonusTier))).size
  )
}

function readStoredValidatedCount<T extends string>(key: string, allowed: Set<T>): number {
  try {
    const stored = localStorage.getItem(key)
    const parsed = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return 0
    return new Set(
      parsed.filter((value): value is T => typeof value === 'string' && allowed.has(value as T)),
    ).size
  } catch {
    return 0
  }
}

function countLocalBonusMedals(): number {
  return (
    readStoredValidatedCount('pw-slider-medals', BONUS_TIER_VALUES) +
    readStoredValidatedCount('pw-lightsout-medals', BONUS_TIER_VALUES) +
    readStoredValidatedCount('pw-netwalk-medals', BONUS_TIER_VALUES) +
    readStoredValidatedCount('pw-2048-medals', BONUS_2048_VALUES) +
    readStoredValidatedCount('pw-queens-medals', BONUS_TIER_VALUES) +
    readStoredValidatedCount('pw-starbattle-medals', BONUS_TIER_VALUES)
  )
}

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
  const [bonusMedalCount, setBonusMedalCount] = useState(0)
  const canRegister = canRegisterForPuzzleWeek(user)
  const canDownloadPacket = canDownloadPuzzleWeekPacketIdentity(user)
  const canManage = canManagePuzzleWeekIdentity(user)
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

  useEffect(() => {
    if (!user || isGuest) {
      setBonusMedalCount(0)
      return
    }
    const signedInUser = user
    setBonusMedalCount(countLocalBonusMedals())
    let cancelled = false
    async function syncBonusCount() {
      try {
        const medals = await getPuzzleWeekBonusMedals(CURRENT_PUZZLE_WEEK_EVENT.id, signedInUser)
        if (!cancelled) {
          const remoteCount = countBonusMedals(medals)
          setBonusMedalCount(current => Math.max(current, remoteCount))
        }
      } catch { /* keep local count */ }
    }
    void syncBonusCount()

    function handleWindowFocus() {
      void syncBonusCount()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void syncBonusCount()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, isGuest])

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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="mx-auto max-w-md rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-[var(--color-accent)] border-t-transparent animate-spin" />
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Loading Puzzle Week</h2>
          <p className="text-sm text-[var(--color-muted)]">
            We’re checking your sign-in and getting everything ready.
          </p>
        </div>
      </main>
    )
  }

  const mainPuzzlesSolvedCount = Object.values(progress).filter(
    p => p.solved && MAIN_PUZZLES.some(mp => mp.id === p.puzzleId)
  ).length

  return (
    <main className="min-h-screen flex flex-col px-4 sm:px-6 py-6 sm:py-8" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-5xl flex flex-col flex-1 gap-5 sm:gap-6">

        {/* ── Mobile header: stacked ── */}
        <div className="sm:hidden space-y-3">
          <div className="flex items-center justify-between">
            <Link href="/home" className="select-none" aria-label="Return to AbraStat">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" style={{ width: '150px', height: 'auto' }} />
            </Link>
            {user && !isGuest && (
              <div className="flex items-center gap-2">
                {canManage && (
                  <Link
                    href="/puzzleweek/admin"
                    className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-slate-50"
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
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
            <div className="relative z-10 ml-auto flex items-center gap-2">
              {canManage && (
                <Link
                  href="/puzzleweek/admin"
                  className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {(user && !isGuest) && countdown && !countdown.started && !countdown.ended && (
          <div className="text-center pt-1 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Puzzle Week begins in
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

        {user && !isGuest && <div className={`grid gap-4 ${entry ? 'lg:grid-cols-2' : ''}`}>
          {entry && (
            <div className="rounded-3xl border border-[var(--color-border)] bg-white/80 px-4 sm:px-5 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    Puzzle Week progress
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {solvedCount} of {PUZZLE_WEEK_PUZZLES.length} puzzles solved so far.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[var(--color-text)]">
                    {solvedCount}
                    <span className="text-base font-medium text-[var(--color-muted)]">/{PUZZLE_WEEK_PUZZLES.length}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {PUZZLE_WEEK_PUZZLES.map((puzzle, i) => {
                  const solved = progress[puzzle.id]?.solved === true
                  const isMeta = i === PUZZLE_WEEK_PUZZLES.length - 1
                  return (
                    <div
                      key={`summary-${puzzle.id}`}
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
          )}

          <div className="rounded-3xl border border-[var(--color-border)] bg-white/80 px-4 sm:px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  Bonus Puzzles: Try to earn all {TOTAL_BONUS_MEDALS} medals.
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {bonusMedalCount} of {TOTAL_BONUS_MEDALS} earned across the bonus puzzles.
                </p>
              </div>
              <Link
                href="/puzzleweek/bonus"
                className="inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Logic Puzzles
              </Link>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--color-accent-light)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                style={{ width: `${(bonusMedalCount / TOTAL_BONUS_MEDALS) * 100}%` }}
              />
            </div>
          </div>
        </div>}

        {entry && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">

            {/* Rules card */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-white/70 px-4 sm:px-7 py-4 sm:py-5 shadow-sm">
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

            {/* Scrollable leaderboard */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-[var(--color-accent)]" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">Leaderboard</span>
                  {!loadingLeaderboard && leaderboard.length > 0 && (
                    <span className="text-xs text-[var(--color-muted)]">{leaderboard.length}</span>
                  )}
                </div>
                <button
                  onClick={() => { void loadLeaderboard(user) }}
                  disabled={loadingLeaderboard}
                  className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted)] transition hover:border-[var(--color-accent)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingLeaderboard ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
                {loadingLeaderboard ? (
                  <div className="flex justify-center py-6">
                    <div className="h-5 w-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--color-muted)]">
                    No entries yet.
                  </div>
                ) : (
                  leaderboard.map((lb, i) => {
                    const isMe = lb.entryId === entry.id
                    const rank = i + 1
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                    return (
                      <div
                        key={lb.entryId}
                        className={`flex items-start gap-2 border-b px-3 py-2 last:border-b-0 border-[var(--color-border)] ${
                          isMe ? 'bg-[var(--color-accent-light)]/40' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="w-6 flex-shrink-0 text-center">
                          {medal
                            ? <span className="text-sm leading-none">{medal}</span>
                            : <span className="text-xs font-semibold text-[var(--color-muted)]">{rank}</span>
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5">
                            <span className={`text-xs font-semibold leading-snug break-words ${isMe ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                              {lb.name}
                            </span>
                            {isMe && (
                              <span className="flex-shrink-0 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                                you
                              </span>
                            )}
                          </div>
                          {lb.type === 'team' && (lb.memberNames?.length ?? 0) > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-snug text-[var(--color-muted)]">
                              {(lb.memberNames ?? []).map(memberName => (
                                <span key={memberName} className="whitespace-normal break-words">
                                  {memberName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 gap-0.5">
                          {PUZZLE_WEEK_PUZZLES.map((puzzle, pi) => {
                            const isMeta = pi === PUZZLE_WEEK_PUZZLES.length - 1
                            const solved = lb.solvedPuzzleIds.includes(puzzle.id)
                            return (
                              <div
                                key={puzzle.id}
                                title={puzzle.title}
                                className={`h-2 w-2 rounded-full ${solved ? (isMeta ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-[var(--color-border)]'}`}
                              />
                            )
                          })}
                        </div>
                        <div className="w-8 flex-shrink-0 text-right text-xs font-bold text-[var(--color-text)]">
                          {lb.solvedCount}<span className="font-normal text-[var(--color-muted)]">/{PUZZLE_WEEK_PUZZLES.length}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

          </div>
        )}

        {user && !entry && loadingRegistration && (
          <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center space-y-3">
            <div className="mx-auto h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent animate-spin" />
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Loading your registration</h2>
            <p className="text-sm text-[var(--color-muted)]">
              We’re checking your Puzzle Week entry now.
            </p>
          </div>
        )}

        {/* ── Auth / registration states ── */}
        {!user || isGuest ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            {countdown && !countdown.started && !countdown.ended && (
              <div className="text-center space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                  Puzzle Week begins in
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
            <PuzzleSignIn />
          </div>
        ) : loadingRegistration && !entry ? (
          null
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
              <div className="px-6 pt-6 pb-5">
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
              </div>

              {entry.type === 'solo' && (
                <div className="border-t border-[var(--color-border)] px-6 py-4">
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

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Puzzles 1–6 */}
            {(() => {
              const easiestIds = voteTally ? topVotedIds(voteTally.easiest) : new Set<string>()
              const hardestIds  = voteTally ? topVotedIds(voteTally.hardest)  : new Set<string>()
              const favoriteIds = voteTally ? topVotedIds(voteTally.favorite) : new Set<string>()
              const getBadges = (id: string): PuzzleBadge[] => [
                easiestIds.has(id)  ? 'easiest'  : null,
                hardestIds.has(id)  ? 'hardest'  : null,
                favoriteIds.has(id) ? 'favorite' : null,
              ].filter(Boolean) as PuzzleBadge[]
              return (
                <>
                  <div>
                    <h3 className="mb-4 text-lg sm:text-xl font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                      Submit your answers here
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
                          badges={getBadges(puzzle.id)}
                          onAnswerChange={value => {
                            setPuzzleAnswers(current => ({ ...current, [puzzle.id]: value }))
                            setAnswerMessages(current => ({ ...current, [puzzle.id]: undefined }))
                          }}
                          onCheck={() => handleCheckAnswer(puzzle.id)}
                        />
                      ))}
                    </div>
                  </div>

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
                      badges={getBadges(META_PUZZLE.id)}
                      onAnswerChange={value => {
                        setPuzzleAnswers(current => ({ ...current, [META_PUZZLE.id]: value }))
                        setAnswerMessages(current => ({ ...current, [META_PUZZLE.id]: undefined }))
                      }}
                      onCheck={() => handleCheckAnswer(META_PUZZLE.id)}
                    />
                  </div>
                </>
              )
            })()}
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
        {user && !isGuest && <div className="space-y-5 border-t border-[var(--color-border)] pt-8">
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
        </div>}

        {/* Leaderboard — full version for non-registered users */}
        {user && !isGuest && !entry && <div className="space-y-4 border-t border-[var(--color-border)] pt-8">
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
                const isMe = false
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
                      {lb.type === 'team' && (lb.memberNames?.length ?? 0) > 0 && (
                        <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                          {(lb.memberNames ?? []).join(', ')}
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
        </div>}

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
  badges = [],
  onAnswerChange,
  onCheck,
}: {
  puzzle: PuzzleWeekPuzzle
  index: number
  solved: boolean
  answer: string
  answerMessage: PuzzleWeekAnswerResult | undefined
  checking: boolean
  badges?: PuzzleBadge[]
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
          {badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {badges.map(badge => (
                <span key={badge} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_CONFIG[badge].className}`}>
                  {BADGE_CONFIG[badge].label}
                </span>
              ))}
            </div>
          )}
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
  badges = [],
  onAnswerChange,
  onCheck,
}: {
  puzzle: PuzzleWeekPuzzle
  solved: boolean
  answer: string
  answerMessage: PuzzleWeekAnswerResult | undefined
  checking: boolean
  mainPuzzlesSolvedCount: number
  badges?: PuzzleBadge[]
  onAnswerChange: (value: string) => void
  onCheck: () => void
}) {
  const colonIdx = puzzle.title.indexOf(': ')
  const puzzleName = colonIdx !== -1 ? puzzle.title.slice(colonIdx + 2) : puzzle.title

  return (
    <div className={`rounded-2xl border p-6 transition-colors ${
      solved
        ? 'border-amber-300 bg-white'
        : 'border-amber-200/70 bg-white'
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
          {badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {badges.map(badge => (
                <span key={badge} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_CONFIG[badge].className}`}>
                  {BADGE_CONFIG[badge].label}
                </span>
              ))}
            </div>
          )}
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
