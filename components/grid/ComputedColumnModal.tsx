'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { evaluateFormula } from '@/lib/formulaEval'

interface Props {
  open: boolean
  onClose: () => void
}

const OPS = [
  { label: '+', insert: ' + ' },
  { label: '−', insert: ' - ' },
  { label: '×', insert: ' * ' },
  { label: '÷', insert: ' / ' },
  { label: '^2', insert: '^2' },
  { label: '^3', insert: '^3' },
  { label: '^n', insert: '^' },
  { label: '( )', insert: '()' },
  { label: '√', insert: 'sqrt()' },
  { label: 'log', insert: 'log()' },
  { label: 'ln', insert: 'ln()' },
  { label: '|x|', insert: 'abs()' },
]

export function ComputedColumnModal({ open, onClose }: Props) {
  const { grid, addComputedColumn } = useStore()
  const [name, setName] = useState('')
  const [formula, setFormula] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const formulaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => { setName(''); setFormula('') }, 0)
      return () => clearTimeout(t)
    }
  }, [open])

  const numericCols = grid.columns.filter(c => c.type === 'numeric')

  const preview = useMemo(() => {
    if (!formula.trim()) return []
    return grid.rows.slice(0, 5).map(row => evaluateFormula(formula, grid.columns, row))
  }, [formula, grid])

  const allNull = formula.trim().length > 0 && preview.every(v => v === null)

  function insertAtCursor(text: string) {
    const el = formulaRef.current
    if (!el) { setFormula(f => f + text); return }
    const start = el.selectionStart ?? formula.length
    const end = el.selectionEnd ?? formula.length
    const next = formula.slice(0, start) + text + formula.slice(end)
    setFormula(next)
    setTimeout(() => {
      const pos = start + text.length
      el.focus()
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  function handleAdd() {
    if (!name.trim() || !formula.trim() || allNull) return
    addComputedColumn(name.trim(), formula.trim())
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[var(--color-text)] text-base">New Computed Column</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        {/* Column name */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Column name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. gold_pct"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        {/* Variable chips */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">
            Variables — click to insert
          </label>
          <div className="flex flex-wrap gap-1.5">
            {numericCols.map(col => (
              <button
                key={col.id}
                onClick={() => insertAtCursor(col.name)}
                className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors"
              >
                {col.name}
              </button>
            ))}
            {numericCols.length === 0 && (
              <span className="text-xs text-[var(--color-muted)]">No numeric columns available</span>
            )}
          </div>
        </div>

        {/* Operation buttons */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">Operations</label>
          <div className="flex flex-wrap gap-1.5">
            {OPS.map(op => (
              <button
                key={op.label}
                onClick={() => insertAtCursor(op.insert)}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-[var(--color-bg)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formula input */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Formula</label>
          <input
            ref={formulaRef}
            value={formula}
            onChange={e => setFormula(e.target.value)}
            placeholder="e.g.  gold / total"
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] ${
              allNull ? 'border-[var(--color-danger)] bg-[var(--color-danger-light)]' : 'border-[var(--color-border)]'
            }`}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          {allNull && (
            <p className="text-xs text-[var(--color-danger)] mt-1">Formula couldn&apos;t be evaluated. Check column names and syntax.</p>
          )}
        </div>

        {/* Preview */}
        {preview.length > 0 && !allNull && (
          <div>
            <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">
              Preview (first {preview.length} rows)
            </label>
            <div className="flex gap-2">
              {preview.map((val, i) => (
                <div
                  key={i}
                  className="flex-1 text-center py-1.5 rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] text-sm font-mono font-medium"
                >
                  {val !== null ? (Number.isInteger(val) ? val : val.toPrecision(4)) : '—'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !formula.trim() || allNull}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40"
          >
            Add Column
          </button>
        </div>
      </div>
    </div>
  )
}
