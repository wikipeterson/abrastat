'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'abrastat.palette'

const PALETTES = [
  { id: 'abra', label: 'Abra' },
  { id: 'classic', label: 'Classic' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'citrus', label: 'Citrus' },
] as const

type PaletteId = (typeof PALETTES)[number]['id']

const PALETTE_VARS: Record<PaletteId, Record<string, string>> = {
  abra: {
    '--color-bg': '#E8FAF8',
    '--color-surface': '#FFFFFF',
    '--color-text': '#0D4F49',
    '--color-muted': '#1A8C80',
    '--color-accent': '#2EC4B6',
    '--color-accent-light': '#D6F5F2',
    '--color-border': '#7FD9D3',
    '--color-grid-header': '#0D4F49',
    '--color-grid-selected': '#D6F5F2',
  },
  classic: {
    '--color-bg': '#F6F2EA',
    '--color-surface': '#FFFCF6',
    '--color-text': '#24312F',
    '--color-muted': '#5B6F69',
    '--color-accent': '#2F7D73',
    '--color-accent-light': '#DCEBE7',
    '--color-border': '#B7D1CA',
    '--color-grid-header': '#24312F',
    '--color-grid-selected': '#E5F0EC',
  },
  ocean: {
    '--color-bg': '#EAF3FF',
    '--color-surface': '#FFFFFF',
    '--color-text': '#18324A',
    '--color-muted': '#3D6F91',
    '--color-accent': '#2F80ED',
    '--color-accent-light': '#DCEBFF',
    '--color-border': '#A9CFF5',
    '--color-grid-header': '#18324A',
    '--color-grid-selected': '#DCEBFF',
  },
  citrus: {
    '--color-bg': '#FFF6E8',
    '--color-surface': '#FFFFFF',
    '--color-text': '#3F3020',
    '--color-muted': '#8A6A3E',
    '--color-accent': '#F4A300',
    '--color-accent-light': '#FFE7B5',
    '--color-border': '#F2C970',
    '--color-grid-header': '#3F3020',
    '--color-grid-selected': '#FFF0CC',
  },
}

function applyPalette(id: PaletteId) {
  const root = document.documentElement
  root.dataset.palette = id
  const vars = PALETTE_VARS[id]
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

export function PalettePicker() {
  const [palette, setPalette] = useState<PaletteId>('abra')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as PaletteId | null
    const id = stored && PALETTES.some(p => p.id === stored) ? stored : 'abra'
    setPalette(id)
    applyPalette(id)
  }, [])

  function handleChange(nextPalette: PaletteId) {
    setPalette(nextPalette)
    applyPalette(nextPalette)
    localStorage.setItem(STORAGE_KEY, nextPalette)
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs font-medium text-[var(--color-muted)]">Color palette</div>
      <div className="grid grid-cols-2 gap-2">
        {PALETTES.map(option => {
          const active = option.id === palette
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleChange(option.id)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-light)]/60'
              }`}
              aria-pressed={active}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
