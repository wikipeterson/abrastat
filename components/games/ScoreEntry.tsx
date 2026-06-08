'use client'

import { useRef, useState } from 'react'

const EMOJIS = [
  '🦊','🐯','🦁','🐻','🐼','🐨','🦄','🐲',
  '🚀','⚡','🔥','❄️','🌊','🌈','⭐','🎯',
  '📈','📊','🧮','🔢','🎲','🃏','🏆','🎮',
  '🌙','☀️','💎','👾','🤖','🦋','🎵','🍕',
]

export const PLAYER_STORAGE_KEY = 'abrastat_player'

export function loadPlayer(): { initials: string; emoji: string } {
  if (typeof window === 'undefined') return { initials: 'AAA', emoji: '🦊' }
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p.initials?.length === 3 && p.emoji) return p
    }
  } catch { /* ignore */ }
  return { initials: 'AAA', emoji: '🦊' }
}

interface Props {
  score: number
  maxScore: number
  onSubmit: (initials: string, emoji: string) => Promise<void>
  submitting: boolean
}

export function ScoreEntry({ score, maxScore, onSubmit, submitting }: Props) {
  const saved = loadPlayer()
  const [letters, setLetters] = useState<[string, string, string]>(
    [saved.initials[0], saved.initials[1], saved.initials[2]]
  )
  const [emoji, setEmoji] = useState(saved.emoji)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  function handleChange(i: 0 | 1 | 2, raw: string) {
    const char = raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(-1)
    if (!char) return
    const next = [...letters] as [string, string, string]
    next[i] = char
    setLetters(next)
    if (i < 2) refs[i + 1].current?.focus()
  }

  function handleKeyDown(i: 0 | 1 | 2, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && i > 0) refs[i - 1].current?.focus()
    if (e.key === 'ArrowLeft'  && i > 0) refs[i - 1].current?.focus()
    if (e.key === 'ArrowRight' && i < 2) refs[i + 1].current?.focus()
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const code = letters[i].charCodeAt(0)
      const next = [...letters] as [string, string, string]
      next[i] = e.key === 'ArrowUp'
        ? String.fromCharCode(code === 90 ? 65 : code + 1)
        : String.fromCharCode(code === 65 ? 90 : code - 1)
      setLetters(next)
    }
  }

  async function handleSubmit() {
    const initials = letters.join('')
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ initials, emoji }))
    await onSubmit(initials, emoji)
  }

  const pct = Math.round((score / maxScore) * 100)
  const resultEmoji = pct === 100 ? '🏆' : pct >= 80 ? '🌟' : pct >= 60 ? '👍' : pct >= 40 ? '📚' : '💪'

  return (
    <div className="space-y-5">
      {/* Score */}
      <div className="text-center">
        <div className="text-5xl mb-2">{resultEmoji}</div>
        <div className="text-4xl font-bold text-[var(--color-accent)] tabular-nums">
          {score} <span className="text-lg font-normal text-[var(--color-muted)]">/ {maxScore}</span>
        </div>
        <div className="text-sm text-[var(--color-muted)] mt-1">{pct}% accuracy</div>
      </div>

      {/* Initials */}
      <div className="text-center space-y-2">
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--color-muted)]">
          Enter Your Initials
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div className="flex gap-2">
            {([0, 1, 2] as const).map(i => (
              <input
                key={i}
                ref={refs[i]}
                type="text"
                maxLength={2}
                value={letters[i]}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => e.target.select()}
                className="w-14 h-16 text-center font-mono font-bold text-3xl rounded-xl border-2 border-[var(--color-border)] focus:border-[var(--color-accent)] focus:bg-[var(--color-accent-light)] focus:text-[var(--color-accent)] bg-[var(--color-bg)] outline-none uppercase caret-transparent"
              />
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Type or use ↑↓ arrows to change letters</p>
      </div>

      {/* Emoji picker */}
      <div className="space-y-2">
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--color-muted)] text-center">
          Pick Your Emoji
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`text-xl py-1 rounded-lg transition-colors ${
                emoji === e
                  ? 'bg-[var(--color-accent-light)] ring-2 ring-[var(--color-accent)]'
                  : 'hover:bg-[var(--color-bg)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-white font-bold text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? 'Submitting…' : 'Submit Score →'}
      </button>
    </div>
  )
}
