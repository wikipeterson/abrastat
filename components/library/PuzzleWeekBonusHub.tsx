'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Calendar, ChevronRight, Puzzle, Sparkles } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'

const BONUS_PUZZLES = [
  {
    title: 'Sudoku',
    blurb: 'A classic number-placement grid with a clean square play area.',
    accent: 'from-sky-100 to-cyan-50',
  },
  {
    title: 'Nonogram',
    blurb: 'Picture-logic rows and columns with room for a satisfying square grid.',
    accent: 'from-emerald-100 to-teal-50',
  },
  {
    title: 'Jigsaw Puzzle',
    blurb: 'A square image puzzle area ready for draggable pieces and snap zones.',
    accent: 'from-amber-100 to-orange-50',
  },
  {
    title: 'Lights Out',
    blurb: 'A tidy square board for toggle strategy and quick replay rounds.',
    accent: 'from-fuchsia-100 to-rose-50',
  },
] as const

const LIGHTS_OUT_SIZE = 5

function toggleLightsOutCell(board: boolean[], row: number, col: number) {
  const next = [...board]
  const deltas = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]

  for (const [dr, dc] of deltas) {
    const nr = row + dr
    const nc = col + dc
    if (nr < 0 || nr >= LIGHTS_OUT_SIZE || nc < 0 || nc >= LIGHTS_OUT_SIZE) continue
    const index = nr * LIGHTS_OUT_SIZE + nc
    next[index] = !next[index]
  }

  return next
}

function createLightsOutBoard() {
  let board = Array.from({ length: LIGHTS_OUT_SIZE * LIGHTS_OUT_SIZE }, () => false)
  const scrambleMoves = 14 + Math.floor(Math.random() * 8)

  for (let i = 0; i < scrambleMoves; i += 1) {
    const row = Math.floor(Math.random() * LIGHTS_OUT_SIZE)
    const col = Math.floor(Math.random() * LIGHTS_OUT_SIZE)
    board = toggleLightsOutCell(board, row, col)
  }

  if (board.every(cell => !cell)) {
    return toggleLightsOutCell(board, 2, 2)
  }

  return board
}

function LightsOutBoard() {
  const [board, setBoard] = useState<boolean[]>(() => createLightsOutBoard())
  const [moves, setMoves] = useState(0)

  const solved = board.every(cell => !cell)

  function handlePress(row: number, col: number) {
    if (solved) return
    setBoard(current => toggleLightsOutCell(current, row, col))
    setMoves(current => current + 1)
  }

  function handleReset() {
    setBoard(createLightsOutBoard())
    setMoves(0)
  }

  return (
    <div className="flex h-full flex-col rounded-[1.35rem] bg-white/80 p-4 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Lights Out
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Turn every light off by toggling a circle and its neighbors.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-1 text-right shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Moves
          </div>
          <div className="text-lg font-semibold text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-1 items-center justify-center">
        <div
          className="grid aspect-square w-full max-w-[290px] gap-3 rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
          style={{ gridTemplateColumns: `repeat(${LIGHTS_OUT_SIZE}, minmax(0, 1fr))` }}
        >
          {board.map((isOn, index) => {
            const row = Math.floor(index / LIGHTS_OUT_SIZE)
            const col = index % LIGHTS_OUT_SIZE
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                onClick={() => handlePress(row, col)}
                className={`aspect-square rounded-full border transition duration-150 ${
                  isOn
                    ? 'border-teal-300 bg-[var(--color-accent)] shadow-[0_0_0_4px_rgba(46,196,182,0.16)]'
                    : 'border-slate-200 bg-white hover:border-[var(--color-border)]'
                } ${solved ? 'cursor-default' : 'hover:scale-[1.03] active:scale-[0.98]'}`}
                aria-label={`Toggle light ${row + 1}, ${col + 1}`}
              />
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-h-[1.25rem] text-sm font-medium text-[var(--color-text)]">
          {solved ? 'Solved! Nice work.' : 'All circles need to go dark.'}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

export function PuzzleWeekBonusHub() {
  const { user, isGuest } = useAuth()
  const canManage = canManagePuzzleWeekIdentity(user)

  async function handleSignOut() {
    await signOut()
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/home" className="shrink-0 select-none" aria-label="Return to AbraStat">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" className="h-auto w-32 sm:w-44" />
            </Link>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)] sm:text-xs">
                HHS Math Department Presents
              </p>
              <h1
                className="mt-1 text-3xl font-semibold leading-tight text-[var(--color-text)] sm:text-5xl"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                Bonus Puzzles
              </h1>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
                <Calendar className="h-3 w-3" />
                Puzzle Week 2026 extras
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="https://puzzleweek.abrastat.com"
              className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
            >
              Main Puzzle Week
            </Link>
            {canManage && (
              <Link
                href="/puzzleweek/admin"
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Admin
              </Link>
            )}
            {user && !isGuest && (
              <button
                onClick={() => void handleSignOut()}
                className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--color-border)] bg-white/80 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[var(--color-accent-light)] p-2.5 text-[var(--color-accent)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Bonus puzzle arcade</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-muted)]">
                This page is our home for side puzzles during Puzzle Week. Each puzzle gets its own square container so
                the play area feels intentional and roomy. For now, these are polished placeholders so we can grow each
                puzzle one at a time without reworking the page structure later.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {BONUS_PUZZLES.map(item => (
            <section
              key={item.title}
              className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm"
            >
              <div className={`border-b border-[var(--color-border)] bg-gradient-to-br ${item.accent} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--color-text)]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{item.blurb}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-2 text-[var(--color-accent)] shadow-sm">
                    <Puzzle className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="aspect-square rounded-3xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  {item.title === 'Lights Out' ? (
                    <LightsOutBoard />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center rounded-[1.35rem] bg-white/80 text-center shadow-inner">
                      <div className="rounded-full bg-[var(--color-accent-light)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                        Coming Soon
                      </div>
                      <p className="mt-4 max-w-[14rem] text-sm leading-relaxed text-[var(--color-muted)]">
                        Square puzzle container reserved for the interactive {item.title.toLowerCase()} build.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <Link
            href="https://puzzleweek.abrastat.com"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)] transition hover:opacity-80"
          >
            Back to Puzzle Week
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </main>
  )
}
