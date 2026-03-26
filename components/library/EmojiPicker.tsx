'use client'

import { useState, useRef, useEffect } from 'react'

const DATASET_EMOJIS: Record<string, string[]> = {
  'Data & Stats':  ['📊', '📈', '📉', '🔢', '📋', '📌', '📎', '🗂️', '🗃️', '📐', '📏', '🧮', '💹', '🔣', '📝', '🖩', '🔍', '📂', '💾', '🖨️', '📅', '🗓️', '📓', '🗒️', '📍', '💯', '➕', '➖', '✖️', '➗', '🔖'],
  'Science':       ['🔬', '🧪', '🧬', '🌡️', '⚗️', '🔭', '🧲', '💡', '⚛️', '🧫', '🧿', '🔋', '🔌', '💊', '🩺', '🧠'],
  'Sports':        ['🏀', '⚽', '🏈', '⚾', '🎾', '🏊', '🏃', '🥇', '🏆', '🥈', '🥉', '⚡', '🎽', '🏋️', '🤸', '🚴', '🏌️', '🎿', '🏒', '🎯'],
  'Nature':        ['🌿', '🌊', '🌤️', '🌱', '🐾', '🦋', '🌍', '❄️', '🌋', '🌵', '🌸', '🍃', '🌙', '☀️', '🌈', '🦁', '🐬', '🦅', '🌾', '🏔️'],
  'Society':       ['👥', '🏫', '🗳️', '💰', '🚗', '✈️', '🍎', '🎬', '🏙️', '👨‍👩‍👧‍👦', '🏥', '🏛️', '⚖️', '🎓', '📰', '🌐', '🤝', '💳', '🏠', '🚢'],
  'Food & Health': ['🍕', '🍔', '🥗', '🍱', '☕', '🍷', '🥦', '🍓', '🧃', '🍞', '🥩', '🐟', '🫀', '🏃‍♂️', '💪', '😴'],
  'Tech & Work':   ['💻', '📱', '🖥️', '⌨️', '🖱️', '📡', '🛰️', '🤖', '🔐', '📲', '🧑‍💻', '👩‍🔬', '👨‍🏫', '🏭', '🔧', '⚙️'],
  'Fun & Random':  ['🎲', '🎮', '🃏', '🎭', '🎨', '🎵', '🎸', '🎤', '🚀', '👾', '🌟', '🔥', '💥', '🎊', '🦄', '🍀'],
}

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-14 h-14 text-3xl flex items-center justify-center bg-[var(--color-accent-light)] rounded-xl hover:bg-teal-100 transition-colors"
        title="Choose emoji"
      >
        {value}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-96 bg-white rounded-xl shadow-lg border border-[var(--color-border)] p-3 max-h-80 overflow-y-auto">
          {Object.entries(DATASET_EMOJIS).map(([group, emojis]) => (
            <div key={group} className="mb-2">
              <p className="text-xs text-[var(--color-muted)] mb-1">{group}</p>
              <div className="flex flex-wrap gap-1">
                {emojis.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onChange(e); setOpen(false) }}
                    className={`text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 transition-colors ${value === e ? 'bg-[var(--color-accent-light)]' : ''}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
