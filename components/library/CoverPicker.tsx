'use client'

import { useRef, useEffect } from 'react'
import { getCover } from '@/lib/datasetCovers'

const GROUPS = [
  { label: 'Stats & Data',      ids: ['teal-chart', 'indigo-data', 'sky-numbers', 'cyan-stats', 'emerald-calendar', 'violet-percent', 'amber-bars', 'rose-line'] },
  { label: 'Science',           ids: ['emerald-science', 'lime-biology', 'violet-chem', 'blue-space', 'cyan-physics', 'amber-dino', 'pink-brain', 'teal-leaflab'] },
  { label: 'Sports',            ids: ['orange-hoops', 'green-soccer', 'red-football', 'yellow-trophy', 'blue-baseball', 'teal-tennis', 'violet-volley', 'slate-runner'] },
  { label: 'Nature & Weather',  ids: ['green-nature', 'blue-ocean', 'amber-weather', 'teal-earth', 'indigo-night', 'sky-rain', 'rose-flower', 'emerald-tree'] },
  { label: 'Society & School',  ids: ['rose-people', 'purple-school', 'slate-econ', 'gray-survey', 'blue-books', 'amber-history', 'teal-vote', 'indigo-family'] },
  { label: 'Other',             ids: ['pink-health', 'red-food', 'orange-pizza', 'green-broccoli', 'blue-transport', 'zinc-tech', 'sky-plane', 'emerald-bike', 'violet-robot', 'amber-phone'] },
]

interface CoverPickerProps {
  open: boolean
  value: string
  onChange: (id: string) => void
  onClose: () => void
}

export function CoverPicker({ open, value, onChange, onClose }: CoverPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-2 w-[29rem] max-h-[32rem] overflow-y-auto bg-white rounded-2xl shadow-xl border border-[var(--color-border)] p-4 space-y-3"
    >
      {GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)] mb-1.5">
            {group.label}
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {group.ids.map(id => {
              const cover = getCover(id)
              if (!cover) return null
              const active = value === id
              return (
                <button
                  key={id}
                  type="button"
                  title={cover.label}
                  onClick={() => { onChange(id); onClose() }}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-transform hover:scale-110 ${active ? 'ring-2 ring-offset-1 ring-[var(--color-accent)]' : ''}`}
                  style={{ background: cover.bg }}
                >
                  {cover.emoji}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
