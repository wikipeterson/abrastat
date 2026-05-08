'use client'

import { useEffect, useState } from 'react'
import { SignInButton } from '@/components/auth/SignInButton'

const SIZE = 360
const TILE = SIZE / 3  // 120px
const SOLVED_KEY = 'pw2026-puzzle-solved'

// ---------- puzzle logic ----------

function getNeighbors(idx: number): number[] {
  const r = Math.floor(idx / 3), c = idx % 3
  const n: number[] = []
  if (r > 0) n.push(idx - 3)
  if (r < 2) n.push(idx + 3)
  if (c > 0) n.push(idx - 1)
  if (c < 2) n.push(idx + 1)
  return n
}

function generateShuffle(steps = 120): number[] {
  const t = [1, 2, 3, 4, 5, 6, 7, 8, 0]
  let e = 8, last = -1
  for (let i = 0; i < steps; i++) {
    const ns = getNeighbors(e).filter(n => n !== last)
    const pick = ns[Math.floor(Math.random() * ns.length)]
    t[e] = t[pick]; t[pick] = 0
    last = e; e = pick
  }
  // Guarantee not accidentally solved
  if (t.every((v, i) => (i === 8 ? v === 0 : v === i + 1))) return generateShuffle(steps)
  return t
}

function isSolved(tiles: number[]): boolean {
  return tiles.every((v, i) => (i === 8 ? v === 0 : v === i + 1))
}

// ---------- static visual face (rendered inside each tile, not interactive) ----------

function CardFace() {
  return (
    <div style={{
      width: SIZE, height: SIZE,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 40,
      background: 'white',
      borderRadius: 24,
      border: '1px solid var(--color-border)',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text)', textAlign: 'center' }}>
        Sign in to register
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
        Use your Haverford School District Google account to join.
      </p>
      {/* Visual-only Google button — not wired to OAuth */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: '1px solid var(--color-border)',
        borderRadius: 12, padding: '11px 22px',
        background: 'white', fontSize: 14, fontWeight: 500,
        color: 'var(--color-text)', whiteSpace: 'nowrap',
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C18.657 14.08 17.64 11.77 17.64 9.2z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        Sign in with Google
      </div>
    </div>
  )
}

// ---------- main component ----------

type Phase = 'puzzle' | 'celebrating' | 'signin'

export function PuzzleSignIn() {
  const [phase, setPhase] = useState<Phase>('puzzle')
  const [tiles, setTiles] = useState<number[]>(() => generateShuffle())
  const [moves, setMoves] = useState(0)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    try {
      if (localStorage.getItem(SOLVED_KEY)) setPhase('signin')
    } catch { /* localStorage unavailable */ }
  }, [])

  const emptyIdx = tiles.indexOf(0)

  function move(idx: number) {
    if (phase !== 'puzzle') return
    if (!getNeighbors(emptyIdx).includes(idx)) return
    const next = [...tiles]
    next[emptyIdx] = next[idx]
    next[idx] = 0
    setTiles(next)
    const newMoves = moves + 1
    setMoves(newMoves)
    if (isSolved(next)) {
      setPhase('celebrating')
      try { localStorage.setItem(SOLVED_KEY, '1') } catch { /* ignore */ }
      setTimeout(() => setPhase('signin'), 1800)
    }
  }

  function restart() {
    setTiles(generateShuffle())
    setMoves(0)
    setPhase('puzzle')
    setResetKey(k => k + 1)
    try { localStorage.removeItem(SOLVED_KEY) } catch { /* ignore */ }
  }

  if (phase === 'signin') {
    return (
      <div className="mx-auto max-w-sm rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm text-center space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Sign in to register</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Use your Haverford School District Google account to join.
        </p>
        <div className="flex justify-center">
          <SignInButton googleOnly />
        </div>
        <button
          onClick={restart}
          className="text-xs text-[var(--color-muted)] underline underline-offset-2 hover:text-[var(--color-text)] transition-colors"
        >
          Play again
        </button>
      </div>
    )
  }

  const celebrating = phase === 'celebrating'

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[var(--color-text)]">Solve the puzzle to sign in</p>
        <p className="text-xs text-[var(--color-muted)]">{moves} move{moves !== 1 ? 's' : ''}</p>
      </div>

      <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div
          key={resetKey}
          className="relative select-none rounded-3xl"
          style={{
            width: SIZE, height: SIZE,
            flexShrink: 0,
            background: 'var(--color-bg)',
            boxShadow: celebrating
              ? '0 0 0 3px var(--color-accent), 0 8px 30px rgba(0,0,0,0.12)'
              : '0 4px 20px rgba(0,0,0,0.10)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {tiles.map((value, idx) => {
            if (value === 0) return null
            const row = Math.floor(idx / 3)
            const col = idx % 3
            const imgRow = Math.floor((value - 1) / 3)
            const imgCol = (value - 1) % 3
            const canSlide = getNeighbors(emptyIdx).includes(idx)

            return (
              <div
                key={value}
                onClick={() => move(idx)}
                style={{
                  position: 'absolute',
                  width: TILE, height: TILE,
                  left: col * TILE, top: row * TILE,
                  overflow: 'hidden',
                  borderRadius: 6,
                  cursor: canSlide && !celebrating ? 'pointer' : 'default',
                  transition: 'left 0.14s ease, top 0.14s ease, box-shadow 0.25s ease',
                  boxShadow: celebrating
                    ? 'inset 0 0 0 2px var(--color-accent)'
                    : 'inset 0 0 0 2px var(--color-bg)',
                  willChange: 'left, top',
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: -(imgCol * TILE),
                  top: -(imgRow * TILE),
                  pointerEvents: 'none',
                }}>
                  <CardFace />
                </div>
              </div>
            )
          })}

          {celebrating && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10 rounded-3xl"
              style={{ background: 'rgba(255,255,255,0.88)' }}
            >
              <div className="text-center space-y-2">
                <div className="text-4xl">🎉</div>
                <div className="text-xl font-semibold text-[var(--color-text)]">You solved it!</div>
                <div className="text-sm text-[var(--color-muted)]">{moves} move{moves !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={restart}
        className="text-xs text-[var(--color-muted)] underline underline-offset-2 hover:text-[var(--color-text)] transition-colors"
      >
        Restart
      </button>
    </div>
  )
}
