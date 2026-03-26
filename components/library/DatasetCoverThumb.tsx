'use client'

import { isCoverId, getCover } from '@/lib/datasetCovers'

interface DatasetCoverThumbProps {
  cover: string        // cover id OR legacy emoji character
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: { wrap: 'w-10 h-10 rounded-lg', emoji: 'text-xl' },
  md: { wrap: 'w-12 h-12 rounded-xl', emoji: 'text-2xl' },
  lg: { wrap: 'w-full h-32 rounded-xl', emoji: 'text-5xl' },
}

export function DatasetCoverThumb({ cover, size = 'md', className = '' }: DatasetCoverThumbProps) {
  const s = SIZE[size]

  if (isCoverId(cover)) {
    const c = getCover(cover)!
    return (
      <div
        className={`${s.wrap} flex items-center justify-center flex-shrink-0 ${className}`}
        style={{ background: c.bg }}
      >
        <span className={s.emoji}>{c.emoji}</span>
      </div>
    )
  }

  // Legacy emoji fallback
  return (
    <div className={`${s.wrap} flex items-center justify-center bg-[var(--color-accent-light)] flex-shrink-0 ${className}`}>
      <span className={s.emoji}>{cover}</span>
    </div>
  )
}
