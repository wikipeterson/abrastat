'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GridColumn } from '@/types'
import { useStore } from '@/lib/store'
import { useSwapAnim } from '@/lib/swapAnimContext'

interface DropZoneProps {
  id: string
  label: string
  hint?: string
  assignedCol: GridColumn | null
  onClear: () => void
  onAssign?: (colId: string) => boolean
  allowedTypes?: GridColumn['type'][]
  variant?: 'horizontal' | 'vertical'
}

function TypeBadge({ type }: { type: GridColumn['type'] }) {
  return <span className="flex-shrink-0 opacity-70 text-xs font-mono">{type === 'numeric' ? '#' : 'A'}</span>
}

// Compute fixed position for the portal popover, flipping/clamping to stay on-screen.
function computePopoverPos(anchor: DOMRect): { top: number; left: number; maxHeight: number } {
  const IDEAL_MAX_H = 360
  const MIN_H = 180
  const MIN_W = 200
  const GAP = 6
  const PAD = 8

  const spaceBelow = window.innerHeight - anchor.bottom - GAP - PAD
  const spaceAbove = anchor.top - GAP - PAD
  const preferBelow = spaceBelow >= MIN_H || spaceBelow >= spaceAbove
  const usableHeight = Math.max(MIN_H, Math.min(IDEAL_MAX_H, preferBelow ? spaceBelow : spaceAbove))

  let top = preferBelow
    ? anchor.bottom + GAP
    : Math.max(PAD, anchor.top - GAP - usableHeight)

  let left = anchor.left
  if (left + MIN_W > window.innerWidth - PAD) {
    left = window.innerWidth - PAD - MIN_W
  }
  if (left < PAD) left = PAD

  return { top, left, maxHeight: usableHeight }
}

export function DropZone({
  id,
  label,
  hint,
  assignedCol,
  onClear,
  onAssign,
  allowedTypes,
  variant = 'horizontal',
}: DropZoneProps) {
  const { grid, selectedColumnIds } = useStore()
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const { setNodeRef: setDragRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: `zc:${id}`,
    data: { colId: assignedCol?.id, sourceZoneId: id },
    disabled: !assignedCol,
  })
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()

  const swapAnim = useSwapAnim()
  const isSwapTarget = swapAnim?.zoneId === id
  const swapAnimation: string | undefined = isSwapTarget
    ? (swapAnim!.direction === 'from-right' ? 'swap-chip-from-right 0.22s ease-out'
     : swapAnim!.direction === 'from-left' ? 'swap-chip-from-left  0.22s ease-out'
     : 'swap-chip-pop        0.22s ease-out')
    : undefined

  const validColumns = useMemo(() => {
    if (!onAssign) return []
    return grid.columns.filter(col => !allowedTypes || allowedTypes.includes(col.type))
  }, [allowedTypes, grid.columns, onAssign])

  const selectedColumns = useMemo(
    () => validColumns.filter(col => selectedColumnIds.includes(col.id)),
    [selectedColumnIds, validColumns],
  )

  const remainingColumns = useMemo(
    () => validColumns.filter(col => !selectedColumnIds.includes(col.id)),
    [selectedColumnIds, validColumns],
  )

  const menuRows = useMemo(() => {
    const rows: Array<{ kind: 'column' | 'clear'; col?: GridColumn }> = []
    if (assignedCol) {
      rows.push({ kind: 'column', col: assignedCol })
    }
    for (const col of selectedColumns) {
      if (assignedCol?.id === col.id) continue
      rows.push({ kind: 'column', col })
    }
    for (const col of remainingColumns) {
      if (assignedCol?.id === col.id) continue
      rows.push({ kind: 'column', col })
    }
    if (assignedCol) rows.push({ kind: 'clear' })
    return rows
  }, [assignedCol, remainingColumns, selectedColumns])

  useEffect(() => {
    if (!open) return
    const currentIndex = assignedCol
      ? Math.max(0, menuRows.findIndex(row => row.kind === 'column' && row.col?.id === assignedCol.id))
      : 0
    setActiveIndex(currentIndex)
  }, [assignedCol, menuRows, open])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    // Close when the canvas pans or the page scrolls so the anchor doesn't drift
    function handleScrollOrResize() {
      setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    rowRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  function closeMenu() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function toggleMenu() {
    if (!onAssign && !assignedCol) return
    if (!open && buttonRef.current) {
      setPopoverPos(computePopoverPos(buttonRef.current.getBoundingClientRect()))
    }
    setOpen(prev => !prev)
  }

  function applyAssignment(colId: string) {
    if (!onAssign) return
    const applied = onAssign(colId)
    if (applied) closeMenu()
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!menuRows.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(prev => (prev + 1) % menuRows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(prev => (prev - 1 + menuRows.length) % menuRows.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(menuRows.length - 1)
    }
  }

  const filledColors = isOver
    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
    : 'border-transparent bg-[var(--color-accent-light)]/30'
  const emptyColors = isOver
    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
    : 'border-dashed border-[var(--color-border)] bg-[var(--color-bg)]'

  const zoneClass = assignedCol ? filledColors : emptyColors
  const zoneButtonClass = `w-full rounded-xl border-2 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${zoneClass}`

  const pickerPanel = open && onAssign && popoverPos ? createPortal(
    <div
      ref={panelRef}
      id={listboxId}
      role="listbox"
      tabIndex={-1}
      onKeyDown={handleMenuKeyDown}
      style={{
        position: 'fixed',
        top: popoverPos.top,
        left: popoverPos.left,
        zIndex: 9999,
        minWidth: 200,
        width: 'max-content',
        maxWidth: 320,
        maxHeight: popoverPos.maxHeight,
      }}
      className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]"
    >
      <div
        style={{ maxHeight: popoverPos.maxHeight }}
        className="overflow-y-auto overscroll-contain p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--color-border)]"
      >
        {selectedColumns.length > 0 && (
          <div className="sticky top-0 z-10 bg-white px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Selected
          </div>
        )}
        {menuRows.map((row, index) => {
          const isChecked = row.kind === 'column' && row.col?.id === assignedCol?.id
          const showDivider =
            selectedColumns.length > 0 &&
            index === selectedColumns.filter(col => col.id !== assignedCol?.id).length + (assignedCol && selectedColumnIds.includes(assignedCol.id) ? 1 : 0) &&
            row.kind === 'column' &&
            !selectedColumnIds.includes(row.col!.id)

          return (
            <div key={row.kind === 'clear' ? 'clear' : row.col!.id}>
              {showDivider && (
                <div className="sticky top-0 z-10 bg-white px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                  All variables
                </div>
              )}
              {row.kind === 'clear' ? (
                <button
                  ref={node => { rowRefs.current[index] = node }}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex min-h-[40px] w-full items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  onClick={() => { onClear(); closeMenu() }}
                >
                  Clear
                </button>
              ) : (
                <button
                  ref={node => { rowRefs.current[index] = node }}
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  className={`flex min-h-[40px] w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm hover:bg-[var(--color-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                    isChecked ? 'bg-[var(--color-accent-light)] text-[var(--color-text)]' : 'text-[var(--color-text)]'
                  }`}
                  onClick={() => applyAssignment(row.col!.id)}
                >
                  <TypeBadge type={row.col!.type} />
                  <span className="flex-1 text-left">{row.col!.name}</span>
                  {isChecked && <span className="flex-shrink-0 text-xs font-semibold text-[var(--color-accent)]">Current</span>}
                </button>
              )}
            </div>
          )
        })}
        {menuRows.length === 0 && (
          <div className="px-3 py-2 text-sm text-[var(--color-muted)] whitespace-nowrap">No matching variables.</div>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div className="relative w-full">
      {variant === 'vertical' ? (
        <button
          ref={node => {
            setDropRef(node)
            buttonRef.current = node
          }}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          onClick={toggleMenu}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleMenu()
            }
          }}
          className={`${zoneButtonClass} h-full min-h-[44px] flex items-center justify-center`}
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
                  animation: swapAnimation ?? 'chip-to-vertical 0.28s ease-out',
                }}
                className="flex items-center gap-1.5 px-2 py-2.5 rounded-lg bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)] text-sm font-medium cursor-grab active:cursor-grabbing"
              >
                <TypeBadge type={assignedCol.type} />
                <span>{assignedCol.name}</span>
              </div>
            </div>
          ) : (
            <div
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              className="px-1 text-center"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)] leading-tight">{label}</div>
              <div className="mt-2 text-[10px] text-[var(--color-muted)] leading-tight">{hint ?? 'Drop or click to add'}</div>
            </div>
          )}
        </button>
      ) : (
        <button
          ref={node => {
            setDropRef(node)
            buttonRef.current = node
          }}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          onClick={toggleMenu}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleMenu()
            }
          }}
          className={`${zoneButtonClass} ${assignedCol ? 'flex items-center justify-center p-1.5 min-h-[44px]' : 'flex flex-col items-start justify-center px-4 py-2 min-h-[44px]'}`}
        >
          {assignedCol ? (
            <div
              key={assignedCol.id}
              ref={setDragRef}
              style={{
                transform: CSS.Translate.toString(transform),
                animation: swapAnimation ?? 'chip-to-horizontal 0.28s ease-out',
              }}
              {...listeners}
              {...attributes}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)] text-sm font-medium cursor-grab active:cursor-grabbing select-none transition-opacity ${
                isDragging ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <TypeBadge type={assignedCol.type} />
              <span>{assignedCol.name}</span>
            </div>
          ) : (
            <>
              <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none">{label}</span>
              <span className="mt-1 text-xs text-[var(--color-muted)] leading-none">{hint ?? 'Drop or click to add'}</span>
            </>
          )}
        </button>
      )}

      {pickerPanel}
    </div>
  )
}
