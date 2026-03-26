'use client'

import { useDroppable } from '@dnd-kit/core'
import { GridColumn } from '@/types'

interface DropZoneProps {
  id: string
  label: string
  hint?: string
  assignedCol: GridColumn | null
  onClear: () => void
}

export function DropZone({ id, label, hint, assignedCol, onClear }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 p-2 min-h-[60px] flex flex-col gap-1.5 transition-colors ${
        isOver
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
          : 'border-dashed border-[var(--color-border)] bg-slate-50'
      }`}
    >
      <div className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none">
        {label}
      </div>
      {assignedCol ? (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium self-start">
          <span className="opacity-70 text-xs font-mono">{assignedCol.type === 'numeric' ? '#' : 'A'}</span>
          <span>{assignedCol.name}</span>
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            className="ml-1 opacity-70 hover:opacity-100 text-base leading-none"
          >
            ×
          </button>
        </div>
      ) : (
        <span className="text-xs text-[var(--color-muted)] italic">{hint ?? 'Drop variable here'}</span>
      )}
    </div>
  )
}
