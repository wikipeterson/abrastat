'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Calendar } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  getPuzzleWeekBonusMedals,
  savePuzzleWeekBonusMedals,
  type PuzzleWeekBonusMedals,
} from '@/lib/puzzleWeek'

// ---------- game constants ----------

const GAME_2048_SIZE = 4
const DIR_BITS = [1, 2, 4, 8] as const

// ---------- slider levels ----------

type SliderLevel = 'easy' | 'medium' | 'hard'
const SLIDER_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
const SLIDER_LABELS: Record<SliderLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const SLIDER_MEDALS: Record<SliderLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const SLIDER_MEDALS_KEY = 'pw-slider-medals'
const LIGHTS_OUT_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
const LIGHTS_OUT_LABELS: Record<SliderLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const LIGHTS_OUT_MEDALS: Record<SliderLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const LIGHTS_OUT_MEDALS_KEY = 'pw-lightsout-medals'

// ---------- netwalk levels ----------

type NetwalkLevel = 'easy' | 'medium' | 'hard'
const NETWALK_SIZES: Record<NetwalkLevel, number> = { easy: 3, medium: 5, hard: 7 }
const NETWALK_LABELS: Record<NetwalkLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const NETWALK_MEDALS: Record<NetwalkLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const NETWALK_MEDALS_KEY = 'pw-netwalk-medals'

// ---------- queens levels ----------

type QueensLevel = 'easy' | 'medium' | 'hard'
const QUEENS_LABELS: Record<QueensLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const QUEENS_MEDALS: Record<QueensLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const QUEENS_MEDALS_KEY = 'pw-queens-medals'

type Game2048Medal = 'bronze' | 'silver' | 'gold'
const GAME_2048_MEDALS: Record<Game2048Medal, { threshold: number; emoji: string; label: string }> = {
  bronze: { threshold: 1024, emoji: '🥉', label: 'Bronze' },
  silver: { threshold: 2048, emoji: '🥈', label: 'Silver' },
  gold: { threshold: 4096, emoji: '🥇', label: 'Gold' },
}
const GAME_2048_MEDALS_KEY = 'pw-2048-medals'

type NetwalkCell = {
  baseMask: number
  rotation: number
  isServer: boolean
}

type Direction2048 = 'up' | 'down' | 'left' | 'right'

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

function createLightsOutBoard(size: number) {
  let board = Array<boolean>(size * size).fill(false)
  const moves = size === 3 ? 8 + Math.floor(Math.random() * 4) : size === 4 ? 11 + Math.floor(Math.random() * 5) : 14 + Math.floor(Math.random() * 8)
  for (let i = 0; i < moves; i++) {
    const r = Math.floor(Math.random() * size)
    const c = Math.floor(Math.random() * size)
    board = toggleCell(board, r, c, size)
  }
  if (board.every(c => !c)) {
    const middle = Math.floor(size / 2)
    board = toggleCell(board, middle, middle, size)
  }
  return board
}

// ---------- Slider Puzzle logic ----------

function sliderNeighbors(emptyIdx: number, size: number) {
  const r = Math.floor(emptyIdx / size), c = emptyIdx % size
  const n: number[] = []
  if (r > 0) n.push(emptyIdx - size)
  if (r < size - 1) n.push(emptyIdx + size)
  if (c > 0) n.push(emptyIdx - 1)
  if (c < size - 1) n.push(emptyIdx + 1)
  return n
}

function createSliderBoard(size: number) {
  const total = size * size
  let board = Array.from({ length: total }, (_, i) => (i === total - 1 ? 0 : i + 1))
  let e = total - 1, prev = -1
  for (let i = 0; i < 200; i++) {
    const choices = sliderNeighbors(e, size).filter(n => n !== prev)
    const pick = choices[Math.floor(Math.random() * choices.length)]
    board[e] = board[pick]; board[pick] = 0
    prev = e; e = pick
  }
  if (board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))) {
    const nb = sliderNeighbors(e, size)[0]
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

function netwalkNeighbors(index: number, size: number) {
  const row = Math.floor(index / size)
  const col = index % size
  const neighbors: Array<{ index: number; dir: number; opposite: number }> = []
  if (row > 0) neighbors.push({ index: index - size, dir: 0, opposite: 2 })
  if (col < size - 1) neighbors.push({ index: index + 1, dir: 1, opposite: 3 })
  if (row < size - 1) neighbors.push({ index: index + size, dir: 2, opposite: 0 })
  if (col > 0) neighbors.push({ index: index - 1, dir: 3, opposite: 1 })
  return neighbors
}

function createNetwalkBoard(size: number) {
  const total = size * size
  const root = Math.floor(total / 2)
  const visited = Array.from({ length: total }, () => false)
  const masks = Array.from({ length: total }, () => 0)

  function visit(index: number) {
    visited[index] = true
    const shuffled = netwalkNeighbors(index, size).sort(() => Math.random() - 0.5)
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

// ---------- 2048 logic ----------

function createEmpty2048Board() {
  return Array<number>(GAME_2048_SIZE * GAME_2048_SIZE).fill(0)
}

function addRandom2048Tile(board: number[]) {
  const empty = board
    .map((value, index) => ({ value, index }))
    .filter(cell => cell.value === 0)

  if (!empty.length) return board

  const pick = empty[Math.floor(Math.random() * empty.length)]!.index
  const next = [...board]
  next[pick] = Math.random() < 0.9 ? 2 : 4
  return next
}

function create2048Board() {
  return addRandom2048Tile(addRandom2048Tile(createEmpty2048Board()))
}

function compress2048Line(line: number[]) {
  const compact = line.filter(Boolean)
  const merged: number[] = []
  let scoreGain = 0

  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i]! * 2
      merged.push(value)
      scoreGain += value
      i += 1
    } else {
      merged.push(compact[i]!)
    }
  }

  while (merged.length < GAME_2048_SIZE) merged.push(0)
  return { line: merged, scoreGain }
}

function move2048(board: number[], direction: Direction2048) {
  const next = [...board]
  let moved = false
  let scoreGain = 0

  const readLine = (index: number) => {
    const line: number[] = []
    for (let offset = 0; offset < GAME_2048_SIZE; offset += 1) {
      const row = direction === 'left' || direction === 'right' ? index : offset
      const col = direction === 'left' || direction === 'right' ? offset : index
      line.push(next[row * GAME_2048_SIZE + col]!)
    }
    return direction === 'right' || direction === 'down' ? line.reverse() : line
  }

  const writeLine = (index: number, line: number[]) => {
    const oriented = direction === 'right' || direction === 'down' ? [...line].reverse() : line
    for (let offset = 0; offset < GAME_2048_SIZE; offset += 1) {
      const row = direction === 'left' || direction === 'right' ? index : offset
      const col = direction === 'left' || direction === 'right' ? offset : index
      const targetIndex = row * GAME_2048_SIZE + col
      if (next[targetIndex] !== oriented[offset]) moved = true
      next[targetIndex] = oriented[offset]!
    }
  }

  for (let i = 0; i < GAME_2048_SIZE; i += 1) {
    const { line, scoreGain: gain } = compress2048Line(readLine(i))
    scoreGain += gain
    writeLine(i, line)
  }

  return { board: moved ? addRandom2048Tile(next) : board, moved, scoreGain }
}

function canMove2048(board: number[]) {
  if (board.includes(0)) return true
  for (let row = 0; row < GAME_2048_SIZE; row += 1) {
    for (let col = 0; col < GAME_2048_SIZE; col += 1) {
      const index = row * GAME_2048_SIZE + col
      const value = board[index]
      if (col < GAME_2048_SIZE - 1 && value === board[index + 1]) return true
      if (row < GAME_2048_SIZE - 1 && value === board[index + GAME_2048_SIZE]) return true
    }
  }
  return false
}

function getNetwalkStatus(board: NetwalkCell[], size: number) {
  const serverIndex = board.findIndex(cell => cell.isServer)
  const connectedIndices = new Set<number>()
  if (serverIndex === -1) return { solved: false, connectedCount: 0, connectedIndices }

  connectedIndices.add(serverIndex)
  const queue = [serverIndex]
  let looseEnds = false

  while (queue.length) {
    const index = queue.shift()!
    const mask = rotateMask(board[index].baseMask, board[index].rotation)

    for (const neighbor of netwalkNeighbors(index, size)) {
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

function BonusGameLayout({
  board,
  sidebar,
}: {
  board: ReactNode
  sidebar: ReactNode
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:flex-row lg:items-stretch lg:gap-4 lg:p-5">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="aspect-square w-full max-w-[420px] lg:h-full lg:w-auto lg:max-w-none">
          {board}
        </div>
      </div>
      <div className="flex min-h-0 w-full flex-col gap-3 overflow-hidden lg:w-[clamp(290px,28vw,350px)] lg:flex-shrink-0 lg:gap-2.5">
        {sidebar}
      </div>
    </div>
  )
}

function BonusInfoCard({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 lg:px-4 lg:py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
        {label}
      </p>
      <div className="mt-1.5 text-[clamp(0.98rem,1.05vw,1.14rem)] leading-[1.45] text-[var(--color-text)]">
        {children}
      </div>
    </div>
  )
}

function BonusStatTile({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[clamp(1.45rem,1.8vw,2rem)] font-bold leading-none text-[var(--color-text)]">
        {value}
      </div>
    </div>
  )
}

function SliderPuzzleBoard({
  medals,
  onSolve,
}: {
  medals: Set<SliderLevel>
  onSolve: (level: SliderLevel) => void
}) {
  const [level, setLevel] = useState<SliderLevel>('medium')
  const size = SLIDER_SIZES[level]
  const [board, setBoard] = useState<number[]>(() => createSliderBoard(SLIDER_SIZES['medium']))
  const [moves, setMoves] = useState(0)
  const [boardKey, setBoardKey] = useState(0)

  function switchLevel(l: SliderLevel) {
    setLevel(l)
    setBoard(createSliderBoard(SLIDER_SIZES[l]))
    setMoves(0)
    setBoardKey(k => k + 1)
  }

  const total = size * size
  const solved = board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))
  const emptyIdx = board.indexOf(0)
  const movableTiles = new Set(solved ? [] : sliderNeighbors(emptyIdx, size).map(index => board[index]).filter(Boolean))

  function handlePress(idx: number) {
    if (solved || !sliderNeighbors(emptyIdx, size).includes(idx)) return
    const next = [...board]
    const e = next.indexOf(0)
    next[e] = next[idx]; next[idx] = 0
    setBoard(next)
    setMoves(m => m + 1)
    if (next.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))) {
      onSolve(level)
    }
  }

  const gap = 8
  const totalGap = (size - 1) * gap
  const tileFont = size === 3 ? 'text-2xl' : size === 4 ? 'text-lg' : 'text-sm'

  return (
    <BonusGameLayout
      board={
        <div className="h-full w-full rounded-[1.65rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner">
          <div key={boardKey} className="relative h-full w-full rounded-[1.1rem] bg-white/50">
            <div
              className="absolute inset-0 grid"
              style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gap: `${gap}px` }}
            >
              {Array.from({ length: total }).map((_, idx) => (
                <div
                  key={`slot-${idx}`}
                  className="rounded-[0.95rem] border border-dashed border-slate-200 bg-white/80"
                />
              ))}
            </div>

            {board.map((value, idx) => {
              if (value === 0) return null
              const row = Math.floor(idx / size)
              const col = idx % size
              const movable = movableTiles.has(value)
              return (
                <button
                  key={`${level}-${value}`}
                  type="button"
                  onClick={() => handlePress(idx)}
                  className={`absolute flex items-center justify-center rounded-[0.95rem] border font-semibold transition-[left,top,transform,box-shadow,border-color,background-color] duration-200 ease-out ${tileFont} ${
                    movable
                      ? 'cursor-pointer border-teal-300 bg-gradient-to-br from-[#f7fffe] to-[#d9f7f3] text-[var(--color-text)] shadow-[0_8px_18px_rgba(46,196,182,0.18)] hover:-translate-y-0.5 hover:border-[var(--color-accent)]'
                      : 'cursor-default border-slate-200 bg-gradient-to-br from-white to-slate-50 text-[var(--color-text)] shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                  }`}
                  style={{
                    width: `calc((100% - ${totalGap}px) / ${size})`,
                    height: `calc((100% - ${totalGap}px) / ${size})`,
                    left: `calc(${col} * ((100% - ${totalGap}px) / ${size} + ${gap}px))`,
                    top: `calc(${row} * ((100% - ${totalGap}px) / ${size} + ${gap}px))`,
                  }}
                >
                  <span className="absolute inset-x-3 top-2 h-px rounded-full bg-white/80" />
                  <span className="relative">{value}</span>
                </button>
              )
            })}
          </div>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-2.5">
          <div>
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Slider Puzzle
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Put the tiles in order.
            </h2>
          </div>
          <BonusInfoCard label="Goal">
            Arrange the numbered tiles from <strong>1</strong> up to the final tile so the empty space ends in the bottom-right corner.
          </BonusInfoCard>
          <BonusInfoCard label="How It Works">
            Only tiles touching the empty space can move. Click or tap an adjacent tile to slide it into the gap.
          </BonusInfoCard>
          <div className="flex flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {SLIDER_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {SLIDER_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BonusStatTile label="Moves" value={moves} />
            <BonusStatTile label="Size" value={`${size}×${size}`} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--color-text)] lg:text-sm">
              {solved
                ? `🎉 ${SLIDER_MEDALS[level]} ${SLIDER_LABELS[level]} solved!`
                : 'Slide adjacent tiles into the empty space.'}
            </p>
            <button
              type="button"
              onClick={() => { setBoard(createSliderBoard(size)); setMoves(0); setBoardKey(k => k + 1) }}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50 lg:text-sm"
            >
              New Board
            </button>
          </div>
        </div>
      }
    />
  )
}

function LightsOutBoard({
  medals,
  onSolve,
}: {
  medals: Set<SliderLevel>
  onSolve: (level: SliderLevel) => void
}) {
  const [level, setLevel] = useState<SliderLevel>('medium')
  const size = LIGHTS_OUT_SIZES[level]
  const [board, setBoard] = useState<boolean[]>(() => createLightsOutBoard(LIGHTS_OUT_SIZES.medium))
  const [moves, setMoves] = useState(0)

  const solved = board.every(c => !c)

  function switchLevel(nextLevel: SliderLevel) {
    setLevel(nextLevel)
    setBoard(createLightsOutBoard(LIGHTS_OUT_SIZES[nextLevel]))
    setMoves(0)
  }

  function handlePress(r: number, c: number) {
    if (solved) return
    const next = toggleCell(board, r, c, size)
    setBoard(next)
    setMoves(m => m + 1)
    if (next.every(cell => !cell)) {
      onSolve(level)
    }
  }

  return (
    <BonusGameLayout
      board={
        <div
          className="grid h-full w-full gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {board.map((isOn, idx) => {
            const r = Math.floor(idx / size), c = idx % size
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handlePress(r, c)}
                aria-label={`Toggle light ${r + 1}, ${c + 1}`}
                className={`aspect-square rounded-full border transition duration-150 ${
                  isOn
                    ? 'border-[#d6eef3] bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.92),0_0_20px_rgba(115,221,221,0.22)]'
                    : 'border-teal-300 bg-[var(--color-accent)] shadow-[inset_0_2px_0_rgba(255,255,255,0.18),0_0_0_3px_rgba(14,165,160,0.16)]'
                } ${solved ? 'cursor-default' : 'hover:scale-105 active:scale-95'}`}
              />
            )
          })}
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-2.5">
          <div className="flex-shrink-0">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Lights Out
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Turn every light off.
            </h2>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {LIGHTS_OUT_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {LIGHTS_OUT_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>
          <div className="grid flex-shrink-0 grid-cols-2 gap-3">
            <BonusStatTile label="Moves" value={moves} />
            <button
              type="button"
              onClick={() => { setBoard(createLightsOutBoard(size)); setMoves(0) }}
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Board
              </div>
              <div className="mt-1 text-[clamp(1.15rem,1.55vw,1.55rem)] font-bold leading-none text-[var(--color-text)]">
                New Board
              </div>
            </button>
          </div>
          {solved && (
            <div className="flex-shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              🎉 {LIGHTS_OUT_MEDALS[level]} {LIGHTS_OUT_LABELS[level]} solved!
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3 pb-1 lg:gap-2.5">
              <BonusInfoCard label="Goal">
                Make every circle go dark. When the whole board is dark, you’ve solved the puzzle and earned the medal for that difficulty.
              </BonusInfoCard>
              <BonusInfoCard label="How It Works">
                Clicking a circle flips that circle and its up, down, left, and right neighbors. Plan a few moves ahead because every click affects a cluster.
              </BonusInfoCard>
            </div>
          </div>
        </div>
      }
    />
  )
}

function NetwalkBoard({
  medals,
  onSolve,
}: {
  medals: Set<NetwalkLevel>
  onSolve: (level: NetwalkLevel) => void
}) {
  const [level, setLevel] = useState<NetwalkLevel>('medium')
  const size = NETWALK_SIZES[level]
  const [board, setBoard] = useState<NetwalkCell[]>(() => createNetwalkBoard(NETWALK_SIZES['medium']))
  const [moves, setMoves] = useState(0)
  const pendingTap = useRef<{ index: number; timer: number } | null>(null)
  const solvedAwardedRef = useRef(false)
  const status = getNetwalkStatus(board, size)

  function switchLevel(l: NetwalkLevel) {
    setLevel(l)
    setBoard(createNetwalkBoard(NETWALK_SIZES[l]))
    setMoves(0)
    solvedAwardedRef.current = false
    if (pendingTap.current) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
    }
  }

  // Detect solve
  useEffect(() => {
    if (!status.solved) { solvedAwardedRef.current = false; return }
    if (!solvedAwardedRef.current) {
      solvedAwardedRef.current = true
      onSolve(level)
    }
  }, [status.solved, level, onSolve])

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
    <BonusGameLayout
      board={
        <div
          className="grid h-full w-full overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
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
                key={`${level}-${index}`}
                type="button"
                onClick={() => handleTilePress(index)}
                className={`relative aspect-square transition-colors ${
                  status.solved ? 'cursor-default' : 'cursor-pointer hover:brightness-95'
                } ${isConnected ? 'bg-teal-50' : 'bg-white'}`}
                aria-label={`Rotate network tile ${index + 1}`}
              >
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
                  {hasN && <line x1="50" y1="50" x2="50" y2="0"   stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasE && <line x1="50" y1="50" x2="100" y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasS && <line x1="50" y1="50" x2="50" y2="100" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasW && <line x1="50" y1="50" x2="0"   y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
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
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-2.5">
          <div>
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Netwalk
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Restore the network.
            </h2>
          </div>
          <BonusInfoCard label="Goal">
            Rotate the pieces until every terminal is connected to the server and there are no loose wire ends anywhere in the network.
          </BonusInfoCard>
          <BonusInfoCard label="How It Works">
            Click once to rotate a tile clockwise. Double-click the same tile to rotate it counter-clockwise.
          </BonusInfoCard>
          <div className="flex flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as NetwalkLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {NETWALK_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {NETWALK_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BonusStatTile label="Moves" value={moves} />
            <BonusStatTile label="Connected" value={`${status.connectedCount}/${board.length}`} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="h-2 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="truncate text-xs font-medium text-[var(--color-text)] lg:text-sm">
                {status.solved
                  ? `🎉 ${NETWALK_MEDALS[level]} ${NETWALK_LABELS[level]} restored!`
                  : `${status.connectedCount} / ${board.length} connected`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setBoard(createNetwalkBoard(size)); setMoves(0); solvedAwardedRef.current = false }}
              className="flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50 lg:text-sm"
            >
              New Board
            </button>
          </div>
        </div>
      }
    />
  )
}

function Puzzle2048Board({
  medals,
  onAwardMedal,
}: {
  medals: Set<Game2048Medal>
  onAwardMedal: (medal: Game2048Medal) => void
}) {
  const [board, setBoard] = useState<number[]>(() => create2048Board())
  const [score, setScore] = useState(0)
  const [bestTile, setBestTile] = useState(4)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const won = bestTile >= 2048
  const stuck = !canMove2048(board)

  function handleMove(direction: Direction2048) {
    if (stuck) return
    const result = move2048(board, direction)
    if (!result.moved) return
    setBoard(result.board)
    setScore(current => current + result.scoreGain)
    const nextBest = Math.max(bestTile, ...result.board)
    setBestTile(nextBest)
    if (nextBest >= GAME_2048_MEDALS.gold.threshold) onAwardMedal('gold')
    else if (nextBest >= GAME_2048_MEDALS.silver.threshold) onAwardMedal('silver')
    else if (nextBest >= GAME_2048_MEDALS.bronze.threshold) onAwardMedal('bronze')
  }

  function handleReset() {
    const next = create2048Board()
    setBoard(next)
    setScore(0)
    setBestTile(Math.max(...next))
  }

  const highestMedal: Game2048Medal | null =
    medals.has('gold') ? 'gold' : medals.has('silver') ? 'silver' : medals.has('bronze') ? 'bronze' : null

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const keyMap: Record<string, Direction2048> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const direction = keyMap[event.key]
      if (!direction) return
      event.preventDefault()
      handleMove(direction)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const colorClasses: Record<number, string> = {
    0: 'bg-white/45 text-transparent',
    2: 'bg-[#f5f6ff] text-slate-700',
    4: 'bg-[#e8f7f5] text-teal-700',
    8: 'bg-[#d7f5ef] text-teal-800',
    16: 'bg-[#c6efe8] text-teal-900',
    32: 'bg-[#ffe2ba] text-orange-900',
    64: 'bg-[#ffd19d] text-orange-900',
    128: 'bg-[#ffc37f] text-orange-950',
    256: 'bg-[#ffb560] text-orange-950',
    512: 'bg-[#ffa43f] text-white',
    1024: 'bg-[#f58e2b] text-white',
    2048: 'bg-[#f3c84b] text-slate-900',
  }

  return (
    <BonusGameLayout
      board={
        <div
          className="h-full w-full rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner"
          onTouchStart={(event) => {
            const touch = event.touches[0]
            if (!touch) return
            touchStart.current = { x: touch.clientX, y: touch.clientY }
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current
            const touch = event.changedTouches[0]
            touchStart.current = null
            if (!start || !touch) return
            const dx = touch.clientX - start.x
            const dy = touch.clientY - start.y
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
            handleMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
          }}
        >
          <div className="grid h-full grid-cols-4 gap-2">
            {board.map((value, index) => (
              <button
                key={`2048-${index}`}
                type="button"
                onClick={() => {}}
                className={`aspect-square rounded-2xl border border-white/50 text-lg font-bold shadow-sm transition-colors sm:text-xl ${
                  colorClasses[value] ?? 'bg-[#f28f3b] text-white'
                }`}
              >
                {value === 0 ? '' : value}
              </button>
            ))}
          </div>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-2.5">
          <div>
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              2048
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Merge your way upward.
            </h2>
          </div>
          <BonusInfoCard label="Goal">
            Combine equal tiles to build larger values. Reach <strong>1024</strong> for bronze, <strong>2048</strong> for silver, and <strong>4096</strong> for gold.
          </BonusInfoCard>
          <BonusInfoCard label="How It Works">
            Swipe or use the arrow buttons to slide all tiles at once. Matching numbers merge when they collide.
          </BonusInfoCard>
          <div className={`grid gap-3 ${highestMedal ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {highestMedal && (
              <BonusStatTile label="Medal" value={GAME_2048_MEDALS[highestMedal].emoji} />
            )}
            <BonusStatTile label="Score" value={score} />
            <BonusStatTile label="Best" value={bestTile} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['left', 'up', 'down', 'right'] as Direction2048[]).map(direction => (
              <button
                key={direction}
                type="button"
                onClick={() => handleMove(direction)}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold uppercase text-[var(--color-text)] transition hover:bg-slate-50 lg:text-sm"
              >
                {direction === 'left' ? '←' : direction === 'right' ? '→' : direction === 'up' ? '↑' : '↓'}
              </button>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--color-text)] lg:text-sm">
              {stuck
                ? 'No more moves. Try again?'
                : bestTile >= GAME_2048_MEDALS.gold.threshold
                  ? `🎉 ${GAME_2048_MEDALS.gold.emoji} Gold earned at 4096!`
                  : won
                    ? `🎉 ${GAME_2048_MEDALS.silver.emoji} Silver earned at 2048!`
                    : bestTile >= GAME_2048_MEDALS.bronze.threshold
                      ? `Nice run — ${GAME_2048_MEDALS.bronze.emoji} bronze earned at 1024.`
                      : 'Swipe or use arrow keys to merge tiles.'}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50 lg:text-sm"
            >
              New Board
            </button>
          </div>
        </div>
      }
    />
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
    id: '2048',
    name: '2048',
    emoji: '🔲',
    desc: 'Merge matching tiles to reach 2048',
    live: true,
  },
  {
    id: 'queens',
    name: 'Queens',
    emoji: '👑',
    desc: 'One queen per row, column & color region',
    live: true,
  },
]

const LIVE_PUZZLES = PUZZLE_LIST.filter(p => p.live)
const LAST_PUZZLE_KEY = 'pw-last-puzzle'

type BonusMedalState = {
  slider: Set<SliderLevel>
  lightsOut: Set<SliderLevel>
  netwalk: Set<NetwalkLevel>
  game2048: Set<Game2048Medal>
  queens: Set<QueensLevel>
}

function createEmptyBonusMedalState(): BonusMedalState {
  return {
    slider: new Set(),
    lightsOut: new Set(),
    netwalk: new Set(),
    game2048: new Set(),
    queens: new Set(),
  }
}

function readStoredSet<T extends string>(key: string) {
  try {
    const stored = localStorage.getItem(key)
    return stored ? new Set(JSON.parse(stored) as T[]) : new Set<T>()
  } catch {
    return new Set<T>()
  }
}

function readLocalBonusMedalState(): BonusMedalState {
  return {
    slider: readStoredSet<SliderLevel>(SLIDER_MEDALS_KEY),
    lightsOut: readStoredSet<SliderLevel>(LIGHTS_OUT_MEDALS_KEY),
    netwalk: readStoredSet<NetwalkLevel>(NETWALK_MEDALS_KEY),
    game2048: readStoredSet<Game2048Medal>(GAME_2048_MEDALS_KEY),
    queens: readStoredSet<QueensLevel>(QUEENS_MEDALS_KEY),
  }
}

function writeLocalBonusMedalState(state: BonusMedalState) {
  try { localStorage.setItem(SLIDER_MEDALS_KEY, JSON.stringify([...state.slider])) } catch {}
  try { localStorage.setItem(LIGHTS_OUT_MEDALS_KEY, JSON.stringify([...state.lightsOut])) } catch {}
  try { localStorage.setItem(NETWALK_MEDALS_KEY, JSON.stringify([...state.netwalk])) } catch {}
  try { localStorage.setItem(GAME_2048_MEDALS_KEY, JSON.stringify([...state.game2048])) } catch {}
  try { localStorage.setItem(QUEENS_MEDALS_KEY, JSON.stringify([...state.queens])) } catch {}
}

function bonusMedalsFromProfile(profile: PuzzleWeekBonusMedals): BonusMedalState {
  return {
    slider: new Set(profile.slider as SliderLevel[]),
    lightsOut: new Set(profile.lightsOut as SliderLevel[]),
    netwalk: new Set(profile.netwalk as NetwalkLevel[]),
    game2048: new Set(profile.game2048 as Game2048Medal[]),
    queens: new Set(profile.queens as QueensLevel[]),
  }
}

function bonusMedalsToProfile(state: BonusMedalState): PuzzleWeekBonusMedals {
  return {
    slider: [...state.slider],
    lightsOut: [...state.lightsOut],
    netwalk: [...state.netwalk],
    game2048: [...state.game2048],
    queens: [...state.queens],
  }
}

function unionSets<T>(a: Set<T>, b: Set<T>) {
  return new Set<T>([...a, ...b])
}

function unionBonusMedalStates(a: BonusMedalState, b: BonusMedalState): BonusMedalState {
  return {
    slider: unionSets(a.slider, b.slider),
    lightsOut: unionSets(a.lightsOut, b.lightsOut),
    netwalk: unionSets(a.netwalk, b.netwalk),
    game2048: unionSets(a.game2048, b.game2048),
    queens: unionSets(a.queens, b.queens),
  }
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

function bonusMedalStatesEqual(a: BonusMedalState, b: BonusMedalState) {
  return (
    setsEqual(a.slider, b.slider) &&
    setsEqual(a.lightsOut, b.lightsOut) &&
    setsEqual(a.netwalk, b.netwalk) &&
    setsEqual(a.game2048, b.game2048) &&
    setsEqual(a.queens, b.queens)
  )
}

function cloneBonusMedalState(state: BonusMedalState): BonusMedalState {
  return {
    slider: new Set(state.slider),
    lightsOut: new Set(state.lightsOut),
    netwalk: new Set(state.netwalk),
    game2048: new Set(state.game2048),
    queens: new Set(state.queens),
  }
}

// ---------- page ----------

export function PuzzleWeekBonusHub() {
  const { user, isGuest } = useAuth()
  const canManage = canManagePuzzleWeekIdentity(user)
  const puzzleWeekEventId = CURRENT_PUZZLE_WEEK_EVENT.id

  // Disable pull-to-refresh on mobile so swipe-down gestures don't reload the page.
  // Must target both html AND body — iOS Safari only respects the html element.
  useEffect(() => {
    const prevBody = document.body.style.overscrollBehavior
    const prevHtml = document.documentElement.style.overscrollBehavior
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overscrollBehavior = prevBody
      document.documentElement.style.overscrollBehavior = prevHtml
    }
  }, [])

  const [selectedId, setSelectedId] = useState(() => {
    try {
      const stored = localStorage.getItem(LAST_PUZZLE_KEY)
      if (stored && LIVE_PUZZLES.some(p => p.id === stored)) return stored
    } catch {}
    return LIVE_PUZZLES[0].id
  })

  function selectPuzzle(id: string) {
    setSelectedId(id)
    try { localStorage.setItem(LAST_PUZZLE_KEY, id) } catch {}
  }

  const [sliderMedals, setSliderMedals] = useState<Set<SliderLevel>>(new Set())
  const [lightsOutMedals, setLightsOutMedals] = useState<Set<SliderLevel>>(new Set())
  const [game2048Medals, setGame2048Medals] = useState<Set<Game2048Medal>>(new Set())

  const [netwalkMedals, setNetwalkMedals] = useState<Set<NetwalkLevel>>(new Set())
  const [queensMedals, setQueensMedals] = useState<Set<QueensLevel>>(new Set())
  const bonusMedalStateRef = useRef<BonusMedalState>(createEmptyBonusMedalState())

  function getCurrentBonusMedalState(): BonusMedalState {
    return {
      slider: new Set(bonusMedalStateRef.current.slider),
      lightsOut: new Set(bonusMedalStateRef.current.lightsOut),
      netwalk: new Set(bonusMedalStateRef.current.netwalk),
      game2048: new Set(bonusMedalStateRef.current.game2048),
      queens: new Set(bonusMedalStateRef.current.queens),
    }
  }

  function applyBonusMedalState(next: BonusMedalState) {
    bonusMedalStateRef.current = cloneBonusMedalState(next)
    setSliderMedals(new Set(next.slider))
    setLightsOutMedals(new Set(next.lightsOut))
    setNetwalkMedals(new Set(next.netwalk))
    setGame2048Medals(new Set(next.game2048))
    setQueensMedals(new Set(next.queens))
    writeLocalBonusMedalState(next)
  }

  function syncBonusMedalState(next: BonusMedalState) {
    applyBonusMedalState(next)
    if (user && !isGuest) {
      void savePuzzleWeekBonusMedals(puzzleWeekEventId, user, bonusMedalsToProfile(next)).catch(() => {})
    }
  }

  useEffect(() => {
    const localState = readLocalBonusMedalState()
    applyBonusMedalState(localState)

    if (!user || isGuest) return

    let cancelled = false
    void (async () => {
      try {
        const remoteProfile = await getPuzzleWeekBonusMedals(puzzleWeekEventId, user)
        if (cancelled) return
        const remoteState = bonusMedalsFromProfile(remoteProfile)
        const mergedState = unionBonusMedalStates(getCurrentBonusMedalState(), remoteState)
        applyBonusMedalState(mergedState)
        if (!bonusMedalStatesEqual(remoteState, mergedState)) {
          await savePuzzleWeekBonusMedals(puzzleWeekEventId, user, bonusMedalsToProfile(mergedState))
        }
      } catch {
        // Keep local medals if the account sync fails.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, isGuest, puzzleWeekEventId])

  function awardSliderMedal(level: SliderLevel) {
    const current = getCurrentBonusMedalState()
    if (current.slider.has(level)) return
    const next = { ...current, slider: new Set(current.slider).add(level) }
    syncBonusMedalState(next)
  }

  function awardLightsOutMedal(level: SliderLevel) {
    const current = getCurrentBonusMedalState()
    if (current.lightsOut.has(level)) return
    const next = { ...current, lightsOut: new Set(current.lightsOut).add(level) }
    syncBonusMedalState(next)
  }

  function awardNetwalkMedal(level: NetwalkLevel) {
    const current = getCurrentBonusMedalState()
    if (current.netwalk.has(level)) return
    const next = { ...current, netwalk: new Set(current.netwalk).add(level) }
    syncBonusMedalState(next)
  }

  function award2048Medal(medal: Game2048Medal) {
    const current = getCurrentBonusMedalState()
    if (current.game2048.has(medal)) return
    const next = { ...current, game2048: new Set(current.game2048).add(medal) }
    syncBonusMedalState(next)
  }

  function awardQueensMedal(level: QueensLevel) {
    const current = getCurrentBonusMedalState()
    if (current.queens.has(level)) return
    const next = { ...current, queens: new Set(current.queens).add(level) }
    syncBonusMedalState(next)
  }

  // Listen for solve messages posted by the Queens iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'queens-solved' && e.data?.difficulty) {
        awardQueensMedal(e.data.difficulty as QueensLevel)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function renderGame() {
    switch (selectedId) {
      case 'slider':    return <SliderPuzzleBoard medals={sliderMedals} onSolve={awardSliderMedal} />
      case 'lightsout': return <LightsOutBoard medals={lightsOutMedals} onSolve={awardLightsOutMedal} />
      case 'netwalk':   return <NetwalkBoard medals={netwalkMedals} onSolve={awardNetwalkMedal} />
      case '2048':      return <Puzzle2048Board medals={game2048Medals} onAwardMedal={award2048Medal} />
      case 'queens':    return <iframe src="/queens.html" className="h-full w-full border-0" title="Queens Puzzle" />
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

  // Shared sidebar list (reused across mobile/desktop)
  const puzzleList = (
    <div className="flex flex-col gap-1">
      {PUZZLE_LIST.map(p => (
        <button
          key={p.id}
          type="button"
          disabled={!p.live}
          onClick={() => p.live && selectPuzzle(p.id)}
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
            <p className="mt-0.5 text-xs leading-snug text-[var(--color-muted)]">{p.desc}</p>
            {p.id === 'slider' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${SLIDER_LABELS[l]}: ${sliderMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${sliderMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {SLIDER_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'lightsout' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${LIGHTS_OUT_LABELS[l]}: ${lightsOutMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${lightsOutMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {LIGHTS_OUT_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'netwalk' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as NetwalkLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${NETWALK_LABELS[l]}: ${netwalkMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${netwalkMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {NETWALK_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'queens' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as QueensLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${QUEENS_LABELS[l]}: ${queensMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${queensMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {QUEENS_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {!p.live && (
              <span className="mt-1.5 inline-block rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                Soon
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )

  return (
    <>
      {/* ═══════ Mobile layout — viewport-locked, no page scroll ═══════ */}
      {/* Page scroll is disabled so it doesn't interfere with game touch gestures */}
      <main
        className="sm:hidden flex flex-col bg-[var(--color-bg)]"
        style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none' }}
      >
        {/* Compact nav bar */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
          <Link href="https://puzzleweek.abrastat.com" className="select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: '110px', height: 'auto' }} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="https://puzzleweek.abrastat.com"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)]"
            >
              ← Main
            </Link>
            {user && !isGuest && (
              <button
                onClick={() => void signOut()}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)]"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {/* Horizontal puzzle tabs */}
        <div className="flex flex-shrink-0 gap-2 overflow-x-auto px-4 py-3">
          {PUZZLE_LIST.map(p => (
            <button
              key={p.id}
              type="button"
              disabled={!p.live}
              onClick={() => p.live && selectPuzzle(p.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-medium ${
                selectedId === p.id
                  ? 'border-[var(--color-accent)] bg-teal-50 text-[var(--color-accent)]'
                  : p.live
                    ? 'border-[var(--color-border)] bg-white text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-white/60 text-[var(--color-muted)] opacity-50'
              }`}
            >
              <span>{p.emoji}</span>
              <span>{p.name}</span>
              {p.id === 'slider' && (
                sliderMedals.has('hard') ? <span>🥇</span>
                : sliderMedals.has('medium') ? <span>🥈</span>
                : sliderMedals.has('easy') ? <span>🥉</span>
                : null
              )}
              {p.id === 'lightsout' && (
                lightsOutMedals.has('hard') ? <span>🥇</span>
                : lightsOutMedals.has('medium') ? <span>🥈</span>
                : lightsOutMedals.has('easy') ? <span>🥉</span>
                : null
              )}
              {p.id === 'netwalk' && (
                netwalkMedals.has('hard') ? <span>🥇</span>
                : netwalkMedals.has('medium') ? <span>🥈</span>
                : netwalkMedals.has('easy') ? <span>🥉</span>
                : null
              )}
              {p.id === '2048' && (
                game2048Medals.has('gold') ? <span>🥇</span>
                : game2048Medals.has('silver') ? <span>🥈</span>
                : game2048Medals.has('bronze') ? <span>🥉</span>
                : null
              )}
              {p.id === 'queens' && (
                queensMedals.has('hard') ? <span>🥇</span>
                : queensMedals.has('medium') ? <span>🥈</span>
                : queensMedals.has('easy') ? <span>🥉</span>
                : null
              )}
            </button>
          ))}
        </div>

        {/* Game fills every remaining pixel */}
        {/* touch-action:none tells iOS Safari not to pan/rubber-band this area */}
        <div className="min-h-0 flex-1 px-4 pb-4" style={{ touchAction: 'none' }}>
          <div className="h-full overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
            {renderGame()}
          </div>
        </div>
      </main>

      {/* ═══════ Desktop layout ═══════ */}
      <main
        className="hidden sm:block bg-[var(--color-bg)] px-6 py-8"
        style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none' }}
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">

          {/* Header */}
          <div className="flex relative items-center py-2">
            <Link href="https://puzzleweek.abrastat.com" className="relative z-10 flex-shrink-0 select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(200px, 24vw, 320px)', height: 'auto' }} />
            </Link>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                HHS Math Department Presents
              </p>
              <h1
                className="mt-1 text-4xl lg:text-5xl font-semibold leading-tight text-[var(--color-text)]"
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

          {/* Sidebar + game */}
          <div className="flex min-h-0 flex-1 gap-5 items-stretch overflow-hidden">
            <aside className="flex h-full min-h-0 w-56 flex-shrink-0 self-stretch flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm p-3">
              <p className="px-3 pt-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Puzzles
              </p>
              <div className="h-full min-h-0 flex-1 overflow-y-auto pr-1">
                {puzzleList}
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

            <section className="flex h-full min-h-0 flex-1 min-w-0 self-stretch overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
              <div className="h-full min-h-0 w-full">
                {renderGame()}
              </div>
            </section>
          </div>

        </div>
      </main>
    </>
  )
}
