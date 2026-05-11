'use client'

import { useState } from 'react'
import { SignInButton } from '@/components/auth/SignInButton'

const TILE = 120
const PAD  = 22
const BOX  = TILE + 2 * PAD  // 164
const SIZE = TILE * 3         // 360
const TW2  = 18
const SOLVED_KEY = 'pw2026-puzzle-solved'

const H = [[1,-1],[-1,1],[1,-1]]
const V = [[1,-1,1],[-1,1,-1]]

function getConns(r: number, c: number): [number,number,number,number] {
  return [
    r > 0 ? -V[r-1][c] : 0,
    c < 2 ?  H[r][c]   : 0,
    r < 2 ?  V[r][c]   : 0,
    c > 0 ? -H[r][c-1] : 0,
  ]
}

function buildPath(top: number, right: number, bottom: number, left: number): string {
  const s = PAD, e = PAD + TILE, m = PAD + TILE / 2
  const p: string[] = [`M ${s} ${s}`]

  if (top === 0) { p.push(`L ${e} ${s}`) } else {
    const ay = top > 0 ? 0 : 2*s
    p.push(`L ${m-TW2} ${s}`,`C ${m-TW2} ${s} ${m-TW2} ${ay} ${m} ${ay}`,`C ${m} ${ay} ${m+TW2} ${ay} ${m+TW2} ${s}`,`L ${e} ${s}`)
  }
  if (right === 0) { p.push(`L ${e} ${e}`) } else {
    const ax = right > 0 ? e+PAD : e-PAD
    p.push(`L ${e} ${m-TW2}`,`C ${e} ${m-TW2} ${ax} ${m-TW2} ${ax} ${m}`,`C ${ax} ${m} ${ax} ${m+TW2} ${e} ${m+TW2}`,`L ${e} ${e}`)
  }
  if (bottom === 0) { p.push(`L ${s} ${e}`) } else {
    const ay = bottom > 0 ? e+PAD : e-PAD
    p.push(`L ${m+TW2} ${e}`,`C ${m+TW2} ${e} ${m+TW2} ${ay} ${m} ${ay}`,`C ${m} ${ay} ${m-TW2} ${ay} ${m-TW2} ${e}`,`L ${s} ${e}`)
  }
  if (left === 0) { p.push(`L ${s} ${s}`) } else {
    const ax = left > 0 ? 0 : 2*s
    p.push(`L ${s} ${m+TW2}`,`C ${s} ${m+TW2} ${ax} ${m+TW2} ${ax} ${m}`,`C ${ax} ${m} ${ax} ${m-TW2} ${s} ${m-TW2}`,`L ${s} ${s}`)
  }
  return p.join(' ') + ' Z'
}

const PIECE_PATHS = Array.from({ length: 9 }, (_, v) => {
  const [top, right, bottom, left] = getConns(Math.floor(v/3), v%3)
  return buildPath(top, right, bottom, left)
})

function generateShuffle(): number[] {
  const arr = Array.from({ length: 9 }, (_, i) => i)
  for (let i = 8; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  if (arr.every((v, i) => v === i)) return generateShuffle()
  return arr
}

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
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center' }}>
        Sign in to register
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
        Use your Haverford School District Google account to join.
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: '1.5px solid var(--color-border)',
        borderRadius: 14, padding: '12px 24px',
        background: 'white', fontSize: 15, fontWeight: 500,
        color: 'var(--color-text)', whiteSpace: 'nowrap',
      }}>
        <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C18.657 14.08 17.64 11.77 17.64 9.2z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        Sign in with Google
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        Play again
      </span>
    </div>
  )
}

export function PuzzleSignIn() {
  const [tiles, setTiles] = useState<number[]>(() => {
    try {
      if (localStorage.getItem(SOLVED_KEY)) return Array.from({ length: 9 }, (_, i) => i)
    } catch { /* ignore */ }
    return generateShuffle()
  })
  const [selected, setSelected] = useState<number | null>(null)
  const [swaps, setSwaps] = useState(0)

  const solved = tiles.every((v, i) => v === i)

  function handleClick(idx: number) {
    if (solved) return
    if (selected === null) { setSelected(idx); return }
    if (selected === idx)  { setSelected(null); return }
    const next = [...tiles]
    ;[next[selected], next[idx]] = [next[idx], next[selected]]
    setTiles(next)
    setSwaps(n => n + 1)
    setSelected(null)
    if (next.every((v, i) => v === i)) {
      try { localStorage.setItem(SOLVED_KEY, '1') } catch { /* ignore */ }
    }
  }

  function restart() {
    setTiles(generateShuffle())
    setSwaps(0)
    setSelected(null)
    try { localStorage.removeItem(SOLVED_KEY) } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center space-y-1" style={{ opacity: solved ? 0 : 1, transition: 'opacity 0.3s ease' }}>
        <p className="text-sm font-semibold text-[var(--color-text)]">Solve the puzzle to sign in</p>
        <p className="text-xs text-[var(--color-muted)]">
          {selected !== null ? 'Now click a piece to swap' : `${swaps} swap${swaps !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Container with padding so tab protrusions have room */}
      <div style={{ position: 'relative', padding: PAD }}>

        {/* Jigsaw board — fades out when solved */}
        <div
          className="select-none"
          style={{
            position: 'relative', width: SIZE, height: SIZE,
            opacity: solved ? 0 : 1,
            transition: 'opacity 0.5s ease',
            pointerEvents: solved ? 'none' : 'auto',
          }}
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
                  left: destCol * TILE - PAD,
                  top:  destRow * TILE - PAD,
                  width: BOX, height: BOX,
                  cursor: 'pointer',
                  clipPath: `path('${PIECE_PATHS[value]}')`,
                  filter: isSelected
                    ? 'brightness(0.82) drop-shadow(0 0 5px var(--color-accent))'
                    : 'drop-shadow(0 0 1.5px var(--color-border)) drop-shadow(0 1px 3px rgba(0,0,0,0.15))',
                  transition: 'filter 0.15s ease',
                  zIndex: isSelected ? 10 : 1,
                }}
              >
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
        </div>

        {/* Real sign-in card — fades in when solved, sits over the board */}
        <div
          style={{
            position: 'absolute',
            top: PAD, left: PAD,
            width: SIZE, height: SIZE,
            borderRadius: 24,
            border: '1.5px solid var(--color-border)',
            background: 'white',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 40,
            boxSizing: 'border-box',
            opacity: solved ? 1 : 0,
            transition: 'opacity 0.5s ease',
            pointerEvents: solved ? 'auto' : 'none',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center' }}>
            Sign in to register
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Use your Haverford School District Google account to join.
          </p>
          <SignInButton googleOnly />
          <button
            onClick={restart}
            style={{
              fontSize: 13, color: 'var(--color-muted)',
              textDecoration: 'underline', textUnderlineOffset: 2,
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Play again
          </button>
        </div>
      </div>

      <button
        onClick={restart}
        style={{ opacity: solved ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: solved ? 'none' : 'auto' }}
        className="text-xs text-[var(--color-muted)] underline underline-offset-2 hover:text-[var(--color-text)] transition-colors"
      >
        Restart
      </button>
    </div>
  )
}
