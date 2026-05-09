'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowLeft, Calendar } from 'lucide-react'
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
  const connectedIndices = new Set<number>()
  if (serverIndex === -1) return { solved: false, connectedCount: 0, connectedIndices }

  connectedIndices.add(serverIndex)
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

      if (hasEdge && neighborHasEdge && !connectedIndices.has(neighbor.index)) {
        connectedIndices.add(neighbor.index)
        queue.push(neighbor.index)
      }
    }
  }

  return {
    solved: !looseEnds && connectedIndices.size === board.length,
    connectedCount: connectedIndices.size,
    connectedIndices,
  }
}

// ---------- game components ----------

function SliderPuzzleBoard() {
  const [board, setBoard] = useState<number[]>(() => createSliderBoard())
  const [moves, setMoves] = useState(0)

  const total = SLIDER_SIZE * SLIDER_SIZE
  const solved = board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))
  const emptyIdx = board.indexOf(0)
  const movableTiles = new Set(solved ? [] : sliderNeighbors(emptyIdx).map(index => board[index]).filter(Boolean))

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
        <div className="w-full max-w-[286px] rounded-[1.65rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner">
          <div className="relative aspect-square rounded-[1.1rem] bg-white/50">
            <div
              className="absolute inset-0 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${SLIDER_SIZE}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: total }).map((_, idx) => (
                <div
                  key={`slot-${idx}`}
                  className="rounded-[0.95rem] border border-dashed border-[var(--color-border)] bg-white/45"
                />
              ))}
            </div>

            {board.map((value, idx) => {
              if (value === 0) return null
              const row = Math.floor(idx / SLIDER_SIZE)
              const col = idx % SLIDER_SIZE
              const movable = movableTiles.has(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handlePress(idx)}
                  className={`absolute flex items-center justify-center rounded-[0.95rem] border text-lg font-semibold transition-[left,top,transform,box-shadow,border-color,background-color] duration-200 ease-out ${
                    movable
                      ? 'cursor-pointer border-teal-300 bg-gradient-to-br from-[#f7fffe] to-[#d9f7f3] text-[var(--color-text)] shadow-[0_8px_18px_rgba(46,196,182,0.18)] hover:-translate-y-0.5 hover:border-[var(--color-accent)]'
                      : 'cursor-default border-slate-200 bg-gradient-to-br from-white to-slate-50 text-[var(--color-text)] shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                  }`}
                  style={{
                    width: 'calc((100% - 24px) / 4)',
                    height: 'calc((100% - 24px) / 4)',
                    left: `calc(${col} * ((100% - 24px) / 4 + 8px))`,
                    top: `calc(${row} * ((100% - 24px) / 4 + 8px))`,
                  }}
                >
                  <span className="absolute inset-x-3 top-2 h-px rounded-full bg-white/80" />
                  <span className="relative">{value}</span>
                </button>
              )
            })}
          </div>
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
      prev.map((cell, i) =>
        i === index ? { ...cell, rotation: ((cell.rotation + amount) % 4 + 4) % 4 } : cell
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

  const pct = Math.round((status.connectedCount / board.length) * 100)

  return (
    <div className="flex h-full flex-col gap-3 p-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Netwalk
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)] leading-relaxed">
            You are a network administrator and someone has scrambled your network. Rotate every piece to connect all terminals to the server — no loose ends.
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-muted)] opacity-70">
            Click to rotate · double-click to rotate back
          </p>
        </div>
        <div className="flex-shrink-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Moves</div>
          <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-[270px] overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: `repeat(${NETWALK_SIZE}, minmax(0, 1fr))`,
            gap: '1px',
            background: 'var(--color-border)',
            border: '1px solid var(--color-border)',
          }}
        >
          {board.map((cell, index) => {
            const mask = rotateMask(cell.baseMask, cell.rotation)
            const isConnected = status.connectedIndices.has(index)
            const hasN = Boolean(mask & DIR_BITS[0])
            const hasE = Boolean(mask & DIR_BITS[1])
            const hasS = Boolean(mask & DIR_BITS[2])
            const hasW = Boolean(mask & DIR_BITS[3])
            const pipe = isConnected ? '#0EA5A0' : '#CBD5E1'
            const node = isConnected ? '#0EA5A0' : '#94A3B8'

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleTilePress(index)}
                className={`relative aspect-square transition-colors ${
                  status.solved ? 'cursor-default' : 'cursor-pointer hover:brightness-95'
                } ${isConnected ? 'bg-teal-50' : 'bg-white'}`}
                aria-label={`Rotate network tile ${index + 1}`}
              >
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
                  {/* Pipe arms */}
                  {hasN && <line x1="50" y1="50" x2="50" y2="0"   stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasE && <line x1="50" y1="50" x2="100" y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasS && <line x1="50" y1="50" x2="50" y2="100" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasW && <line x1="50" y1="50" x2="0"   y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {/* Node */}
                  {cell.isServer ? (
                    <g>
                      <rect x="27" y="29" width="46" height="42" rx="7" fill={node} />
                      <rect x="33" y="37" width="28" height="7" rx="2" fill="white" opacity="0.95" />
                      <rect x="33" y="49" width="28" height="7" rx="2" fill="white" opacity="0.95" />
                      <circle cx="65" cy="40.5" r="2.5" fill={node} />
                      <circle cx="65" cy="52.5" r="2.5" fill={node} />
                    </g>
                  ) : (
                    <circle cx="50" cy="50" r="11" fill={node} />
                  )}
                </svg>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="h-2 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="truncate text-sm font-medium text-[var(--color-text)]">
            {status.solved ? '🎉 Network restored!' : `${status.connectedCount} / ${board.length} connected`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setBoard(createNetwalkBoard()); setMoves(0) }}
          className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

// ---------- puzzle registry ----------

const PUZZLE_LIST = [
  {
    id: 'slider',
    name: 'Slider Puzzle',
    emoji: '🔢',
    desc: 'Arrange tiles 1–15 in order',
    live: true,
  },
  {
    id: 'lightsout',
    name: 'Lights Out',
    emoji: '💡',
    desc: 'Toggle cells to turn every light off',
    live: true,
  },
  {
    id: 'netwalk',
    name: 'Netwalk',
    emoji: '🌐',
    desc: 'Rotate pipes to restore the network',
    live: true,
  },
  {
    id: 'coming1',
    name: 'More Coming Soon',
    emoji: '🧩',
    desc: 'New puzzles dropping during Puzzle Week',
    live: false,
  },
]

const LIVE_PUZZLES = PUZZLE_LIST.filter(p => p.live)

// ---------- page ----------

export function PuzzleWeekBonusHub() {
  const { user, isGuest } = useAuth()
  const canManage = canManagePuzzleWeekIdentity(user)

  const [selectedId, setSelectedId] = useState(
    () => LIVE_PUZZLES[Math.floor(Math.random() * LIVE_PUZZLES.length)].id
  )

  function renderGame() {
    switch (selectedId) {
      case 'slider':    return <SliderPuzzleBoard />
      case 'lightsout': return <LightsOutBoard />
      case 'netwalk':   return <NetwalkBoard />
      default:          return null
    }
  }

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
      <div className="mx-auto max-w-6xl space-y-6">

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

        {/* ── Mobile puzzle selector ── */}
        <div className="sm:hidden flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {PUZZLE_LIST.map(p => (
            <button
              key={p.id}
              type="button"
              disabled={!p.live}
              onClick={() => p.live && setSelectedId(p.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                selectedId === p.id
                  ? 'border-[var(--color-accent)] bg-teal-50 text-[var(--color-accent)]'
                  : p.live
                    ? 'border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-slate-50'
                    : 'border-[var(--color-border)] bg-white/60 text-[var(--color-muted)] opacity-50 cursor-default'
              }`}
            >
              <span>{p.emoji}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* ── Main content: sidebar + game ── */}
        <div className="flex gap-5 items-start">

          {/* Sidebar (desktop only) */}
          <aside className="hidden sm:flex flex-col w-56 flex-shrink-0 rounded-3xl border border-[var(--color-border)] bg-white shadow-sm p-3">
            <p className="px-3 pt-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Puzzles
            </p>
            <div className="flex flex-col gap-1">
              {PUZZLE_LIST.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.live}
                  onClick={() => p.live && setSelectedId(p.id)}
                  className={`flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    selectedId === p.id
                      ? 'bg-teal-50'
                      : p.live
                        ? 'hover:bg-slate-50 cursor-pointer'
                        : 'opacity-50 cursor-default'
                  }`}
                >
                  <span className="text-xl leading-none mt-0.5 flex-shrink-0">{p.emoji}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${
                      selectedId === p.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
                    }`}>
                      {p.name}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-[var(--color-muted)]">
                      {p.desc}
                    </p>
                    {!p.live && (
                      <span className="mt-1.5 inline-block rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                        Soon
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-4 border-t border-[var(--color-border)] px-3 pb-2">
              <Link
                href="https://puzzleweek.abrastat.com"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Puzzle Week
              </Link>
            </div>
          </aside>

          {/* Game card */}
          <section className="flex-1 min-w-0 rounded-3xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
            <div className="h-[520px]">
              {renderGame()}
            </div>
          </section>

        </div>

        {/* ── Mobile back link ── */}
        <div className="sm:hidden flex justify-center pb-4">
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
