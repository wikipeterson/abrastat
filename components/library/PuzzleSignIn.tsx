'use client'

import { useEffect, useState } from 'react'
import { SignInButton } from '@/components/auth/SignInButton'

const TILE = 120           // base tile size
const PAD  = 22            // tab protrusion depth
const BOX  = TILE + 2*PAD  // 164 — each piece div
const SIZE = TILE * 3      // 360 — full puzzle
const TW2  = 18            // half-width of tab neck (tab spans 36px)
const SOLVED_KEY = 'pw2026-puzzle-solved'

// H[r][c]: right-edge connector of source piece (r,c), c ∈ {0,1}. +1=tab out, -1=notch in.
const H = [[1,-1],[-1,1],[1,-1]]
// V[r][c]: bottom-edge connector of source piece (r,c), r ∈ {0,1}.
const V = [[1,-1,1],[-1,1,-1]]

function getConns(r: number, c: number): [number,number,number,number] {
  return [
    r > 0 ? -V[r-1][c] : 0,   // top
    c < 2 ?  H[r][c]   : 0,   // right
    r < 2 ?  V[r][c]   : 0,   // bottom
    c > 0 ? -H[r][c-1] : 0,   // left
  ]
}

// Build an SVG path for a jigsaw piece within a BOX×BOX coordinate space.
// The base square occupies (PAD,PAD)→(PAD+TILE, PAD+TILE).
// Tab connectors: +1 = bulge outward, -1 = cut inward, 0 = flat border edge.
function buildPath(top: number, right: number, bottom: number, left: number): string {
  const s = PAD, e = PAD + TILE, m = PAD + TILE / 2
  const p: string[] = [`M ${s} ${s}`]

  // Top edge: left → right (y = s)
  if (top === 0) {
    p.push(`L ${e} ${s}`)
  } else {
    const ay = top > 0 ? 0 : 2*s
    p.push(`L ${m-TW2} ${s}`, `C ${m-TW2} ${s} ${m-TW2} ${ay} ${m} ${ay}`, `C ${m} ${ay} ${m+TW2} ${ay} ${m+TW2} ${s}`, `L ${e} ${s}`)
  }

  // Right edge: top → bottom (x = e)
  if (right === 0) {
    p.push(`L ${e} ${e}`)
  } else {
    const ax = right > 0 ? e+PAD : e-PAD
    p.push(`L ${e} ${m-TW2}`, `C ${e} ${m-TW2} ${ax} ${m-TW2} ${ax} ${m}`, `C ${ax} ${m} ${ax} ${m+TW2} ${e} ${m+TW2}`, `L ${e} ${e}`)
  }

  // Bottom edge: right → left (y = e)
  if (bottom === 0) {
    p.push(`L ${s} ${e}`)
  } else {
    const ay = bottom > 0 ? e+PAD : e-PAD
    p.push(`L ${m+TW2} ${e}`, `C ${m+TW2} ${e} ${m+TW2} ${ay} ${m} ${ay}`, `C ${m} ${ay} ${m-TW2} ${ay} ${m-TW2} ${e}`, `L ${s} ${e}`)
  }

  // Left edge: bottom → top (x = s)
  if (left === 0) {
    p.push(`L ${s} ${s}`)
  } else {
    const ax = left > 0 ? 0 : 2*s
    p.push(`L ${s} ${m+TW2}`, `C ${s} ${m+TW2} ${ax} ${m+TW2} ${ax} ${m}`, `C ${ax} ${m} ${ax} ${m-TW2} ${s} ${m-TW2}`, `L ${s} ${s}`)
  }

  return p.join(' ') + ' Z'
}

// Pre-compute the 9 clip-path strings (indexed by piece value 0–8)
const PIECE_PATHS = Array.from({ length: 9 }, (_, v) => {
  const [top, right, bottom, left] = getConns(Math.floor(v/3), v%3)
  return buildPath(top, right, bottom, left)
})

// ---------- shuffle ----------

function generateShuffle(): number[] {
  const arr = Array.from({ length: 9 }, (_, i) => i)
  for (let i = 8; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  if (arr.every((v, i) => v === i)) return generateShuffle()
  return arr
}

// ---------- card image (same visual as before, rendered inside each piece) ----------

function CardFaceImage() {
  return (
    <div style={{
      width: SIZE, height: SIZE,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 40,
      background: 'white',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text)', textAlign: 'center' }}>
        Sign in to register
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
        Use your Haverford School District Google account to join.
      </p>
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
  const [phase, setPhase]       = useState<Phase>('puzzle')
  const [tiles, setTiles]       = useState<number[]>(() => generateShuffle())
  const [selected, setSelected] = useState<number | null>(null)
  const [swaps, setSwaps]       = useState(0)

  useEffect(() => {
    try {
      if (localStorage.getItem(SOLVED_KEY)) setPhase('signin')
    } catch { /* localStorage unavailable */ }
  }, [])

  function handleClick(idx: number) {
    if (phase !== 'puzzle') return
    if (selected === null)  { setSelected(idx); return }
    if (selected === idx)   { setSelected(null); return }

    const next = [...tiles]
    ;[next[selected], next[idx]] = [next[idx], next[selected]]
    setTiles(next)
    setSwaps(n => n + 1)
    setSelected(null)

    if (next.every((v, i) => v === i)) {
      setPhase('celebrating')
      try { localStorage.setItem(SOLVED_KEY, '1') } catch { /* ignore */ }
      setTimeout(() => setPhase('signin'), 1800)
    }
  }

  function restart() {
    setTiles(generateShuffle())
    setSwaps(0)
    setPhase('puzzle')
    setSelected(null)
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
        <p className="text-xs text-[var(--color-muted)]">
          {selected !== null ? 'Now click a piece to swap' : `${swaps} swap${swaps !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Extra padding so tabs outside the 360px board don't get clipped */}
      <div style={{ padding: PAD, display: 'flex', justifyContent: 'center' }}>
        <div
          className="relative select-none"
          style={{ width: SIZE, height: SIZE }}
        >
          {tiles.map((value, idx) => {
            const destRow = Math.floor(idx / 3), destCol = idx % 3
            const srcRow  = Math.floor(value / 3), srcCol  = value % 3
            const isSelected = selected === idx

            return (
              <div
                key={value}
                onClick={() => handleClick(idx)}
                style={{
                  position: 'absolute',
                  // Offset by -PAD so the BOX×BOX div is centered on the TILE slot
                  left: destCol * TILE - PAD,
                  top:  destRow * TILE - PAD,
                  width: BOX, height: BOX,
                  cursor: celebrating ? 'default' : 'pointer',
                  clipPath: `path('${PIECE_PATHS[value]}')`,
                  // drop-shadow gives visible jigsaw cut lines between pieces
                  filter: celebrating
                    ? `drop-shadow(0 0 6px var(--color-accent))`
                    : isSelected
                      ? `brightness(0.82) drop-shadow(0 0 5px var(--color-accent))`
                      : `drop-shadow(0 1px 3px rgba(0,0,0,0.22))`,
                  transition: 'filter 0.15s ease',
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                {/* Full CardFaceImage shifted so the correct region shows through */}
                <div style={{
                  position: 'absolute',
                  left: PAD - srcCol * TILE,
                  top:  PAD - srcRow * TILE,
                  width: SIZE, height: SIZE,
                  pointerEvents: 'none',
                }}>
                  <CardFaceImage />
                </div>
              </div>
            )
          })}

          {celebrating && (
            <div
              className="absolute inset-0 flex items-center justify-center z-20 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.90)' }}
            >
              <div className="text-center space-y-2">
                <div className="text-4xl">🎉</div>
                <div className="text-xl font-semibold text-[var(--color-text)]">You solved it!</div>
                <div className="text-sm text-[var(--color-muted)]">{swaps} swap{swaps !== 1 ? 's' : ''}</div>
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
