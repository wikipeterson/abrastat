'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GridColumn } from '@/types'

interface DropZoneProps {
  id: string
  label: string
  hint?: string
  assignedCol: GridColumn | null
  onClear: () => void
  variant?: 'horizontal' | 'vertical'
}

export function DropZone({ id, label, hint, assignedCol, onClear, variant = 'horizontal' }: DropZoneProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })

  const { setNodeRef: setDragRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: `zc:${id}`,
    data: { colId: assignedCol?.id, sourceZoneId: id },
    disabled: !assignedCol,
  })

  const baseColors = isOver
    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
    : 'border-dashed border-[var(--color-border)] bg-slate-50'

  if (variant === 'vertical') {
    return (
      <div
        ref={setDropRef}
        className={`rounded-xl border-2 w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 transition-colors ${baseColors}`}
      >
        {assignedCol ? (
          <div
            ref={setDragRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            {...listeners}
            {...attributes}
            className={`select-none transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}`}
          >
            <div
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              className="flex items-center gap-1.5 px-2 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium cursor-grab active:cursor-grabbing"
            >
              <span className="opacity-70 text-[10px] font-mono">{assignedCol.type === 'numeric' ? '#' : 'A'}</span>
              <span>{assignedCol.name}</span>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onClear() }}
                className="mt-1 opacity-70 hover:opacity-100 text-base leading-none"
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <span
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none select-none"
          >
            {label}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      ref={setDropRef}
      className={`rounded-xl border-2 p-2 min-h-[60px] flex flex-col gap-1.5 transition-colors ${baseColors}`}
    >
      <div className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none">
        {label}
      </div>
      {assignedCol ? (
        <div
          ref={setDragRef}
          style={{ transform: CSS.Translate.toString(transform) }}
          {...listeners}
          {...attributes}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium self-start cursor-grab active:cursor-grabbing select-none transition-opacity ${
            isDragging ? 'opacity-30' : 'opacity-100'
          }`}
        >
          <span className="opacity-70 text-xs font-mono">{assignedCol.type === 'numeric' ? '#' : 'A'}</span>
          <span>{assignedCol.name}</span>
          <button
            onPointerDown={e => e.stopPropagation()}
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
