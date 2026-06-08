'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { GridColumn } from '@/types'
import { useStore } from '@/lib/store'

interface Props {
  column: GridColumn
  onClose: () => void
}

export function RenameVariableModal({ column, onClose }: Props) {
  const { renameColumn } = useStore()
  const [name, setName] = useState(column.name)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [mounted])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed !== column.name) renameColumn(column.id, trimmed)
    onClose()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Rename Variable</h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Update the variable name used throughout the grid and cards.</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Variable name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') onClose()
            }}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
