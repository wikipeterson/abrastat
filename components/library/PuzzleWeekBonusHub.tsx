'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Calendar } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'

// ---------- game constants ----------

const NETWALK_SIZE = 5
const GAME_2048_SIZE = 4
const DIR_BITS = [1, 2, 4, 8] as const

// ---------- slider levels ----------

type SliderLevel = 'easy' | 'medium' | 'hard'
const SLIDER_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
const SLIDER_LABELS: Record<SliderLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const SLIDER_MEDALS: Record<SliderLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const SLIDER_MEDALS_KEY = 'pw-slider-medals'
const LIGHTS_OUT_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
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
    <div className="flex h-full flex-col gap-3 p-5">

      {/* Title + moves */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Slider Puzzle
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Arrange the tiles in order.</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Moves</div>
          <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{moves}</div>
        </div>
      </div>

      {/* Level tabs */}
      <div className="flex gap-1.5">
        {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => switchLevel(l)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
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

      {/* Board */}
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-[286px] rounded-[1.65rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner">
          <div key={boardKey} className="relative aspect-square rounded-[1.1rem] bg-white/50">
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
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {solved
            ? `🎉 ${SLIDER_MEDALS[level]} ${SLIDER_LABELS[level]} solved!`
            : 'Slide tiles into the empty space.'}
        </p>
        <button
          type="button"
          onClick={() => { setBoard(createSliderBoard(size)); setMoves(0); setBoardKey(k => k + 1) }}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          New Board
        </button>
      </div>
    </div>
  )
}

function LightsOutBoard() {
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
    setBoard(prev => toggleCell(prev, r, c, size))
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

      <div className="flex gap-1.5">
        {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => switchLevel(l)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              level === l
                ? 'bg-[var(--color-accent)] text-white shadow-sm'
                : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
            }`}
          >
            {SLIDER_LABELS[l]}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-[260px] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
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
          onClick={() => { setBoard(createLightsOutBoard(size)); setMoves(0) }}
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
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            2048
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Combine matching tiles. Arrow keys work too.
          </p>
        </div>
        <div className="flex gap-2">
          {highestMedal && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Medal</div>
              <div className="text-lg leading-tight">{GAME_2048_MEDALS[highestMedal].emoji}</div>
            </div>
          )}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Score</div>
            <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{score}</div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Best</div>
            <div className="text-lg font-bold leading-tight text-[var(--color-text)]">{bestTile}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="w-full max-w-[320px] rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner"
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
          <div className="grid grid-cols-4 gap-2">
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
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text)]">
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
        <div className="flex gap-2">
          {(['left', 'up', 'down', 'right'] as Direction2048[]).map(direction => (
            <button
              key={direction}
              type="button"
              onClick={() => handleMove(direction)}
              className="rounded-xl border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase text-[var(--color-text)] transition hover:bg-slate-50"
            >
              {direction === 'left' ? '←' : direction === 'right' ? '→' : direction === 'up' ? '↑' : '↓'}
            </button>
          ))}
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
          >
            New Board
          </button>
        </div>
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
    id: '2048',
    name: '2048',
    emoji: '🔲',
    desc: 'Merge matching tiles to reach 2048',
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

  const [sliderMedals, setSliderMedals] = useState<Set<SliderLevel>>(new Set())
  const [game2048Medals, setGame2048Medals] = useState<Set<Game2048Medal>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SLIDER_MEDALS_KEY)
      if (stored) setSliderMedals(new Set(JSON.parse(stored) as SliderLevel[]))
    } catch {}
    try {
      const stored2048 = localStorage.getItem(GAME_2048_MEDALS_KEY)
      if (stored2048) setGame2048Medals(new Set(JSON.parse(stored2048) as Game2048Medal[]))
    } catch {}
  }, [])

  function awardSliderMedal(level: SliderLevel) {
    setSliderMedals(prev => {
      if (prev.has(level)) return prev
      const next = new Set(prev)
      next.add(level)
      try { localStorage.setItem(SLIDER_MEDALS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function award2048Medal(medal: Game2048Medal) {
    setGame2048Medals(prev => {
      if (prev.has(medal)) return prev
      const next = new Set(prev)
      next.add(medal)
      try { localStorage.setItem(GAME_2048_MEDALS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function renderGame() {
    switch (selectedId) {
      case 'slider':    return <SliderPuzzleBoard medals={sliderMedals} onSolve={awardSliderMedal} />
      case 'lightsout': return <LightsOutBoard />
      case 'netwalk':   return <NetwalkBoard />
      case '2048':      return <Puzzle2048Board medals={game2048Medals} onAwardMedal={award2048Medal} />
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
        style={{ height: '100dvh', overflow: 'hidden' }}
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
              onClick={() => p.live && setSelectedId(p.id)}
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
              {p.id === '2048' && (
                game2048Medals.has('gold') ? <span>🥇</span>
                : game2048Medals.has('silver') ? <span>🥈</span>
                : game2048Medals.has('bronze') ? <span>🥉</span>
                : null
              )}
            </button>
          ))}
        </div>

        {/* Game fills every remaining pixel */}
        <div className="min-h-0 flex-1 px-4 pb-4">
          <div className="h-full overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
            {renderGame()}
          </div>
        </div>
      </main>

      {/* ═══════ Desktop layout ═══════ */}
      <main className="hidden sm:block min-h-screen bg-[var(--color-bg)] px-6 py-8">
        <div className="mx-auto max-w-6xl space-y-6">

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
          <div className="flex gap-5 items-start">
            <aside className="flex flex-col w-56 flex-shrink-0 rounded-3xl border border-[var(--color-border)] bg-white shadow-sm p-3">
              <p className="px-3 pt-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Puzzles
              </p>
              {puzzleList}
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

            <section className="flex-1 min-w-0 overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
              <div className="h-[520px]">
                {renderGame()}
              </div>
            </section>
          </div>

        </div>
      </main>
    </>
  )
}
