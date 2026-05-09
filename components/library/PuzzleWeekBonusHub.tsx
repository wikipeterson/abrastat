'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowLeft, Calendar, Puzzle } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'

// ---------- game constants ----------

const LIGHTS_OUT_SIZE = 5
const SLIDER_SIZE = 4
const NETWALK_SIZE = 5
const DIR_BITS = [1, 2, 4, 8] as const

type NetwalkCell = {
  baseMask: number
  rotation: number
  isServer: boolean
}

// ---------- Lights Out logic ----------

function toggleCell(board: boolean[], row: number, col: number, size: number) {
  const next = [...board]
  for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr, nc = col + dc
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
    next[nr * size + nc] = !next[nr * size + nc]
  }
  return next
}

function createLightsOutBoard() {
  let board = Array<boolean>(LIGHTS_OUT_SIZE * LIGHTS_OUT_SIZE).fill(false)
  const moves = 14 + Math.floor(Math.random() * 8)
  for (let i = 0; i < moves; i++) {
    const r = Math.floor(Math.random() * LIGHTS_OUT_SIZE)
    const c = Math.floor(Math.random() * LIGHTS_OUT_SIZE)
    board = toggleCell(board, r, c, LIGHTS_OUT_SIZE)
  }
  if (board.every(c => !c)) board = toggleCell(board, 2, 2, LIGHTS_OUT_SIZE)
  return board
}

// ---------- Slider Puzzle logic ----------

function sliderNeighbors(emptyIdx: number) {
  const r = Math.floor(emptyIdx / SLIDER_SIZE), c = emptyIdx % SLIDER_SIZE
  const n: number[] = []
  if (r > 0) n.push(emptyIdx - SLIDER_SIZE)
  if (r < SLIDER_SIZE - 1) n.push(emptyIdx + SLIDER_SIZE)
  if (c > 0) n.push(emptyIdx - 1)
  if (c < SLIDER_SIZE - 1) n.push(emptyIdx + 1)
  return n
}

function createSliderBoard() {
  const total = SLIDER_SIZE * SLIDER_SIZE
  let board = Array.from({ length: total }, (_, i) => (i === total - 1 ? 0 : i + 1))
  let e = total - 1, prev = -1
  for (let i = 0; i < 200; i++) {
    const choices = sliderNeighbors(e).filter(n => n !== prev)
    const pick = choices[Math.floor(Math.random() * choices.length)]
    board[e] = board[pick]; board[pick] = 0
    prev = e; e = pick
  }
  if (board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))) {
    const nb = sliderNeighbors(e)[0]
    board[e] = board[nb]; board[nb] = 0
  }
  return board
}

// ---------- Netwalk logic ----------

function rotateMask(mask: number, turns: number) {
  const normalized = ((turns % 4) + 4) % 4
  if (normalized === 0) return mask
  return ((mask << normalized) | (mask >> (4 - normalized))) & 15
}

function netwalkNeighbors(index: number) {
  const row = Math.floor(index / NETWALK_SIZE)
  const col = index % NETWALK_SIZE
  const neighbors: Array<{ index: number; dir: number; opposite: number }> = []
  if (row > 0) neighbors.push({ index: index - NETWALK_SIZE, dir: 0, opposite: 2 })
  if (col < NETWALK_SIZE - 1) neighbors.push({ index: index + 1, dir: 1, opposite: 3 })
  if (row < NETWALK_SIZE - 1) neighbors.push({ index: index + NETWALK_SIZE, dir: 2, opposite: 0 })
  if (col > 0) neighbors.push({ index: index - 1, dir: 3, opposite: 1 })
  return neighbors
}

function createNetwalkBoard() {
  const total = NETWALK_SIZE * NETWALK_SIZE
  const root = Math.floor(total / 2)
  const visited = Array.from({ length: total }, () => false)
  const masks = Array.from({ length: total }, () => 0)

  function visit(index: number) {
    visited[index] = true
    const shuffled = netwalkNeighbors(index).sort(() => Math.random() - 0.5)
    for (const neighbor of shuffled) {
      if (visited[neighbor.index]) continue
      masks[index] |= DIR_BITS[neighbor.dir]
      masks[neighbor.index] |= DIR_BITS[neighbor.opposite]
      visit(neighbor.index)
    }
  }

  visit(root)

  const board = masks.map((baseMask, index) => ({
    baseMask,
    rotation: Math.floor(Math.random() * 4),
    isServer: index === root,
  }))

  if (board.every(cell => cell.rotation === 0 || cell.baseMask === 15)) {
    const rotatableIndex = board.findIndex(cell => cell.baseMask !== 15)
    if (rotatableIndex >= 0) {
      board[rotatableIndex] = { ...board[rotatableIndex], rotation: 1 }
    }
  }

  return board
}

function getNetwalkStatus(board: NetwalkCell[]) {
  const serverIndex = board.findIndex(cell => cell.isServer)
  if (serverIndex === -1) return { solved: false, connectedCount: 0 }

  const visited = new Set<number>([serverIndex])
  const queue = [serverIndex]
  let looseEnds = false

  while (queue.length) {
    const index = queue.shift()!
    const mask = rotateMask(board[index].baseMask, board[index].rotation)

    for (const neighbor of netwalkNeighbors(index)) {
      const hasEdge = (mask & DIR_BITS[neighbor.dir]) !== 0
      const neighborMask = rotateMask(board[neighbor.index].baseMask, board[neighbor.index].rotation)
      const neighborHasEdge = (neighborMask & DIR_BITS[neighbor.opposite]) !== 0

      if (hasEdge !== neighborHasEdge) looseEnds = true

      if (hasEdge && neighborHasEdge && !visited.has(neighbor.index)) {
        visited.add(neighbor.index)
        queue.push(neighbor.index)
      }
    }
  }

  return {
    solved: !looseEnds && visited.size === board.length,
    connectedCount: visited.size,
  }
}

// ---------- game components ----------

function SliderPuzzleBoard() {
  const [board, setBoard] = useState<number[]>(() => createSliderBoard())
  const [moves, setMoves] = useState(0)

  const total = SLIDER_SIZE * SLIDER_SIZE
  const solved = board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))
  const emptyIdx = board.indexOf(0)

  function handlePress(idx: number) {
    if (solved || !sliderNeighbors(emptyIdx).includes(idx)) return
    setBoard(prev => {
      const next = [...prev]
      const e = next.indexOf(0)
      next[e] = next[idx]; next[idx] = 0
      return next
    })
    setMoves(m => m + 1)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Slider Puzzle
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Arrange the tiles 1 – 15 in order.</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Moves</div>
          <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-[280px] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          style={{ gridTemplateColumns: `repeat(${SLIDER_SIZE}, minmax(0, 1fr))` }}
        >
          {board.map((value, idx) => {
            if (value === 0) {
              return (
                <div
                  key="empty"
                  className="aspect-square rounded-xl border border-dashed border-[var(--color-border)] bg-white/40"
                />
              )
            }
            const movable = !solved && sliderNeighbors(emptyIdx).includes(idx)
            return (
              <button
                key={value}
                type="button"
                onClick={() => handlePress(idx)}
                className={`aspect-square rounded-xl border text-base font-semibold transition-colors ${
                  movable
                    ? 'cursor-pointer border-teal-300 bg-[var(--color-accent-light)] text-[var(--color-text)] hover:border-[var(--color-accent)]'
                    : 'cursor-default border-slate-200 bg-white text-[var(--color-text)]'
                }`}
              >
                {value}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {solved ? '🎉 Solved!' : 'Slide tiles into the empty space.'}
        </p>
        <button
          type="button"
          onClick={() => { setBoard(createSliderBoard()); setMoves(0) }}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

function LightsOutBoard() {
  const [board, setBoard] = useState<boolean[]>(() => createLightsOutBoard())
  const [moves, setMoves] = useState(0)

  const solved = board.every(c => !c)

  function handlePress(r: number, c: number) {
    if (solved) return
    setBoard(prev => toggleCell(prev, r, c, LIGHTS_OUT_SIZE))
    setMoves(m => m + 1)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Lights Out
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Toggle a cell and its neighbors. Turn every light off.</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Moves</div>
          <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-[260px] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          style={{ gridTemplateColumns: `repeat(${LIGHTS_OUT_SIZE}, minmax(0, 1fr))` }}
        >
          {board.map((isOn, idx) => {
            const r = Math.floor(idx / LIGHTS_OUT_SIZE), c = idx % LIGHTS_OUT_SIZE
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handlePress(r, c)}
                aria-label={`Toggle light ${r + 1}, ${c + 1}`}
                className={`aspect-square rounded-full border transition duration-150 ${
                  isOn
                    ? 'border-teal-300 bg-[var(--color-accent)] shadow-[0_0_0_3px_rgba(14,165,160,0.16)]'
                    : 'border-slate-200 bg-white'
                } ${solved ? 'cursor-default' : 'hover:scale-105 active:scale-95'}`}
              />
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {solved ? '🎉 Solved!' : 'All circles need to go dark.'}
        </p>
        <button
          type="button"
          onClick={() => { setBoard(createLightsOutBoard()); setMoves(0) }}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

function NetwalkBoard() {
  const [board, setBoard] = useState<NetwalkCell[]>(() => createNetwalkBoard())
  const [moves, setMoves] = useState(0)
  const pendingTap = useRef<{ index: number; timer: number } | null>(null)
  const status = getNetwalkStatus(board)

  function rotateCell(index: number, amount: number) {
    setBoard(prev =>
      prev.map((cell, cellIndex) =>
        cellIndex === index ? { ...cell, rotation: ((cell.rotation + amount) % 4 + 4) % 4 } : cell
      )
    )
    setMoves(m => m + 1)
  }

  function handleTilePress(index: number) {
    if (status.solved) return

    if (pendingTap.current && pendingTap.current.index === index) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
      rotateCell(index, -1)
      return
    }

    if (pendingTap.current) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
    }

    const timer = window.setTimeout(() => {
      rotateCell(index, 1)
      pendingTap.current = null
    }, 220)

    pendingTap.current = { index, timer }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Netwalk
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Tap clockwise, double tap counter-clockwise, and connect every terminal.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Moves</div>
          <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-[280px] gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5"
          style={{ gridTemplateColumns: `repeat(${NETWALK_SIZE}, minmax(0, 1fr))` }}
        >
          {board.map((cell, index) => {
            const mask = rotateMask(cell.baseMask, cell.rotation)
            return (
              <button
                key={`netwalk-${index}`}
                type="button"
                onClick={() => handleTilePress(index)}
                className="relative aspect-square rounded-xl border border-[var(--color-border)] bg-white transition hover:border-[var(--color-accent)]"
                aria-label={`Rotate network tile ${index + 1}`}
              >
                {(mask & DIR_BITS[0]) !== 0 && (
                  <div className="absolute left-1/2 top-[8%] h-[28%] w-[12%] -translate-x-1/2 rounded-full bg-[var(--color-accent)]" />
                )}
                {(mask & DIR_BITS[1]) !== 0 && (
                  <div className="absolute right-[8%] top-1/2 h-[12%] w-[28%] -translate-y-1/2 rounded-full bg-[var(--color-accent)]" />
                )}
                {(mask & DIR_BITS[2]) !== 0 && (
                  <div className="absolute bottom-[8%] left-1/2 h-[28%] w-[12%] -translate-x-1/2 rounded-full bg-[var(--color-accent)]" />
                )}
                {(mask & DIR_BITS[3]) !== 0 && (
                  <div className="absolute left-[8%] top-1/2 h-[12%] w-[28%] -translate-y-1/2 rounded-full bg-[var(--color-accent)]" />
                )}
                <div
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    cell.isServer
                      ? 'h-[36%] w-[36%] border border-teal-300 bg-teal-100 shadow-[0_0_0_4px_rgba(14,165,160,0.14)]'
                      : 'h-[24%] w-[24%] bg-[var(--color-accent)]'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {status.solved ? '🎉 Network restored!' : `${status.connectedCount}/${board.length} pieces connected to the server.`}
        </p>
        <button
          type="button"
          onClick={() => { setBoard(createNetwalkBoard()); setMoves(0) }}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

function ComingSoonCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--color-border)] bg-white/60 p-10 text-center shadow-sm">
      <div className="rounded-2xl bg-[var(--color-accent-light)] p-3 text-[var(--color-accent)]">
        <Puzzle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mt-2 max-w-[200px] text-sm leading-relaxed text-[var(--color-muted)]">{description}</p>
      <div className="mt-5 rounded-full bg-[var(--color-accent-light)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        Coming Soon
      </div>
    </div>
  )
}

// ---------- page ----------

export function PuzzleWeekBonusHub() {
  const { user, isGuest } = useAuth()
  const canManage = canManagePuzzleWeekIdentity(user)

  const navButtons = (
    <>
      <Link
        href="https://puzzleweek.abrastat.com"
        className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
      >
        Main Puzzles
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
          onClick={() => void signOut()}
          className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
        >
          Sign out
        </button>
      )}
    </>
  )

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Mobile header ── */}
        <div className="sm:hidden space-y-3">
          <div className="flex items-center justify-between">
            <Link href="https://puzzleweek.abrastat.com" className="select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" style={{ width: '140px', height: 'auto' }} />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="https://puzzleweek.abrastat.com"
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-slate-50"
              >
                Main Puzzles
              </Link>
              {user && !isGuest && (
                <button
                  onClick={() => void signOut()}
                  className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              HHS Math Department Presents
            </p>
            <h1
              className="text-3xl font-semibold leading-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              Bonus Puzzles
            </h1>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
              <Calendar className="h-3 w-3" />
              Puzzle Week 2026 extras
            </div>
          </div>
        </div>

        {/* ── Desktop header ── */}
        <div className="hidden sm:flex relative items-center py-2">
          <Link href="https://puzzleweek.abrastat.com" className="relative z-10 flex-shrink-0 select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(200px, 24vw, 320px)', height: 'auto' }} />
          </Link>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              HHS Math Department Presents
            </p>
            <h1
              className="mt-1 text-4xl sm:text-5xl font-semibold leading-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              Bonus Puzzles
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
              <Calendar className="h-3 w-3" />
              Puzzle Week 2026 extras
            </div>
          </div>
          <div className="relative z-10 ml-auto flex flex-shrink-0 items-center gap-2">
            {navButtons}
          </div>
        </div>

        {/* ── Puzzle grid ── */}
        <div className="grid gap-5 md:grid-cols-2">

          <section className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="h-[460px]">
              <SliderPuzzleBoard />
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="h-[460px]">
              <LightsOutBoard />
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="h-[460px]">
              <NetwalkBoard />
            </div>
          </section>

          <ComingSoonCard
            title="More Coming Soon"
            description="More bonus puzzles dropping during Puzzle Week."
          />

        </div>

        {/* ── Back link ── */}
        <div className="flex justify-center pb-4">
          <Link
            href="https://puzzleweek.abrastat.com"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Puzzle Week
          </Link>
        </div>

      </div>
    </main>
  )
}
