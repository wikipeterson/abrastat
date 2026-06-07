'use client'

import { memo, useRef, useState, useEffect } from 'react'

interface EditableCellProps {
  value: string | number
  rowIndex: number
  colId: string
  isActive: boolean
  isSelected: boolean
  isBrushed?: boolean
  onActivate: () => void
  onChange: (rowIndex: number, colId: string, value: string) => void
}

export const EditableCell = memo(function EditableCell({
  value,
  rowIndex,
  colId,
  isActive,
  isSelected,
  isBrushed = false,
  onActivate,
  onChange,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  // When the cell loses active status, exit editing mode asynchronously
  // to avoid a synchronous setState-in-effect cascade render.
  useEffect(() => {
    if (!isActive) {
      const t = setTimeout(() => setEditing(false), 0)
      return () => clearTimeout(t)
    }
  }, [isActive])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== String(value ?? '')) {
      onChange(rowIndex, colId, draft)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setDraft(String(value ?? ''))
      setEditing(false)
    }
  }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!editing) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        onChange(rowIndex, colId, '')
        setDraft('')
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setDraft(e.key)
        setEditing(true)
      } else if (e.key === 'F2' || e.key === 'Enter') {
        setDraft(String(value ?? ''))
        setEditing(true)
      }
    }
  }

  const displayValue = String(value ?? '')

  return (
    <div
      tabIndex={0}
      role="gridcell"
      onClick={() => { onActivate(); if (isActive) setEditing(true) }}
      onDoubleClick={() => { onActivate(); setDraft(String(value ?? '')); setEditing(true) }}
      onKeyDown={handleCellKeyDown}
      className={`relative h-8 px-2 flex items-center text-sm text-[var(--color-text)] border-r border-b border-[var(--color-border)] outline-none cursor-default select-none ${
        isActive ? 'ring-2 ring-inset ring-[var(--color-accent)] z-10' : ''
      } ${
        isSelected && !isActive
          ? 'bg-[var(--color-grid-selected)]'
          : isBrushed
            ? 'bg-[var(--color-gold-light)]/70'
            : 'bg-[var(--color-surface)]'
      }`}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full px-2 text-sm text-[var(--color-text)] bg-[var(--color-surface)] border-none outline-none"
        />
      ) : (
        <span className="truncate w-full">{displayValue}</span>
      )}
    </div>
  )
})
