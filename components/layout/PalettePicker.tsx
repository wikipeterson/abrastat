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

export function PalettePicker() {
  const [palette, setPalette] = useState<PaletteId>('abra')

  useEffect(() => {
    const current = document.documentElement.dataset.palette as PaletteId | undefined
    if (current && PALETTES.some(option => option.id === current)) {
      setPalette(current)
    }
  }, [])

  function handleChange(nextPalette: PaletteId) {
    setPalette(nextPalette)
    document.documentElement.dataset.palette = nextPalette
    localStorage.setItem(STORAGE_KEY, nextPalette)
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-[var(--color-muted)] font-medium">Color palette</span>
      <select
        value={palette}
        onChange={event => handleChange(event.target.value as PaletteId)}
        className="bg-transparent text-[var(--color-text)] text-xs outline-none cursor-pointer"
        aria-label="Choose color palette"
      >
        {PALETTES.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
