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

  // ── Vertical variant (Response Variable — left edge) ──────────────────────
  if (variant === 'vertical') {
    const filledColors = isOver
      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
      : 'border-transparent bg-[var(--color-accent-light)]/30'
    const emptyColors = isOver
      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
      : 'border-dashed border-[var(--color-border)] bg-slate-50'

    return (
      <div
        ref={setDropRef}
        className={`rounded-xl border-2 w-full h-full min-h-[100px] flex items-center justify-center transition-colors ${
          assignedCol ? filledColors : emptyColors
        }`}
      >
        {assignedCol ? (
          <div
            key={assignedCol.id}
            ref={setDragRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            {...listeners}
            {...attributes}
            className={`select-none transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}`}
          >
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                animation: 'chip-to-vertical 0.28s ease-out',
              }}
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
            className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none select-none px-1"
          >
            {label}
          </span>
        )}
      </div>
    )
  }

  // ── Horizontal variant (Explanatory Variable, Group) ──────────────────────
  const filledColors = isOver
    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
    : 'border-transparent bg-[var(--color-accent-light)]/30'
  const emptyColors = isOver
    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
    : 'border-dashed border-[var(--color-border)] bg-slate-50'

  return (
    <div
      ref={setDropRef}
      className={`rounded-xl border-2 transition-colors ${
        assignedCol
          ? `${filledColors} flex items-center justify-center p-1.5 min-h-[44px]`
          : `${emptyColors} flex flex-col gap-1 p-2 min-h-[52px]`
      }`}
    >
      {assignedCol ? (
        <div
          key={assignedCol.id}
          ref={setDragRef}
          style={{
            transform: CSS.Translate.toString(transform),
            animation: 'chip-to-horizontal 0.28s ease-out',
          }}
          {...listeners}
          {...attributes}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium cursor-grab active:cursor-grabbing select-none transition-opacity ${
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
        <>
          <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none">
            {label}
          </span>
          <span className="text-xs text-[var(--color-muted)] italic leading-none">
            {hint ?? 'Drop variable here'}
          </span>
        </>
      )}
    </div>
  )
}
