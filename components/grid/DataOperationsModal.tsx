'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useStore } from '@/lib/store'
import { evaluateFormula } from '@/lib/formulaEval'
import { RowFilter, FilterOp } from '@/types'

type Section = 'computed' | 'sequential' | 'random' | 'stack' | 'unstack' | 'filter'

const NAV: { group: string; items: { id: Section; label: string }[] }[] = [
  {
    group: 'Add Variable',
    items: [
      { id: 'computed', label: 'Computed Formula' },
      { id: 'sequential', label: 'Sequential List' },
      { id: 'random', label: 'Random Variable' },
    ],
  },
  {
    group: 'Reshape',
    items: [
      { id: 'stack', label: 'Stack Columns' },
      { id: 'unstack', label: 'Unstack Columns' },
    ],
  },
  {
    group: 'Filter Rows',
    items: [{ id: 'filter', label: 'Filter Rows' }],
  },
]

const COMPUTED_OPS = [
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

// ─── Computed section ─────────────────────────────────────────────────────────

function ComputedSection({ onClose }: { onClose: () => void }) {
  const { grid, addComputedColumn } = useStore()
  const [name, setName] = useState('')
  const [formula, setFormula] = useState('')
  const formulaRef = useRef<HTMLInputElement>(null)

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
    setTimeout(() => { const pos = start + text.length; el.focus(); el.setSelectionRange(pos, pos) }, 0)
  }

  function handleAdd() {
    if (!name.trim() || !formula.trim() || allNull) return
    addComputedColumn(name.trim(), formula.trim())
    setName(''); setFormula('')
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Computed Formula</h3>
        <p className="text-xs text-[var(--color-muted)]">Create a new variable calculated from existing columns.</p>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Column name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. gold_pct"
          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">Variables — click to insert</label>
        <div className="flex flex-wrap gap-1.5">
          {numericCols.map(col => (
            <button key={col.id} onClick={() => insertAtCursor(col.name)}
              className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors">
              {col.name}
            </button>
          ))}
          {numericCols.length === 0 && <span className="text-xs text-[var(--color-muted)]">No numeric columns</span>}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">Operations</label>
        <div className="flex flex-wrap gap-1.5">
          {COMPUTED_OPS.map(op => (
            <button key={op.label} onClick={() => insertAtCursor(op.insert)}
              className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors">
              {op.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Formula</label>
        <input ref={formulaRef} value={formula} onChange={e => setFormula(e.target.value)} placeholder="e.g. gold / total"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] ${allNull ? 'border-[var(--color-danger-light)] bg-[var(--color-danger-light)]' : 'border-[var(--color-border)]'}`} />
        {allNull && <p className="text-xs text-[var(--color-danger)] mt-1">Formula couldn&apos;t be evaluated. Check column names and syntax.</p>}
      </div>
      {preview.length > 0 && !allNull && (
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Preview (first {preview.length} rows)</label>
          <div className="flex gap-2">
            {preview.map((val, i) => (
              <div key={i} className="flex-1 text-center py-1.5 rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] text-sm font-mono font-medium">
                {val !== null ? (Number.isInteger(val) ? val : val.toPrecision(4)) : '—'}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end pt-1">
        <button onClick={handleAdd} disabled={!name.trim() || !formula.trim() || allNull}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40">
          Add Column
        </button>
      </div>
    </div>
  )
}

// ─── Sequential section ───────────────────────────────────────────────────────

function SequentialSection({ onClose }: { onClose: () => void }) {
  const { grid, addSequentialColumn } = useStore()
  const [name, setName] = useState('')
  const [start, setStart] = useState('1')
  const [increment, setIncrement] = useState('1')
  const [fillAll, setFillAll] = useState(true)
  const [count, setCount] = useState(String(grid.rows.length))

  const s = parseFloat(start), inc = parseFloat(increment)
  const n = fillAll ? grid.rows.length : Math.min(parseInt(count) || 0, grid.rows.length)
  const preview = isFinite(s) && isFinite(inc) ? Array.from({ length: Math.min(5, n) }, (_, i) => parseFloat((s + i * inc).toPrecision(12))) : []
  const canAdd = name.trim() !== '' && isFinite(s) && isFinite(inc) && n > 0

  function handleAdd() {
    if (!canAdd) return
    addSequentialColumn(name.trim(), s, inc, n)
    setName('')
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Sequential List</h3>
        <p className="text-xs text-[var(--color-muted)]">Fill a new column with evenly-spaced values (1, 2, 3… or 0.5, 1.0, 1.5…).</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Column name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. id"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Start</label>
          <input value={start} onChange={e => setStart(e.target.value)} type="number"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Increment</label>
          <input value={increment} onChange={e => setIncrement(e.target.value)} type="number"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-2 block">Fill</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" checked={fillAll} onChange={() => setFillAll(true)} className="accent-[var(--color-accent)]" />
            All {grid.rows.length} rows
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" checked={!fillAll} onChange={() => setFillAll(false)} className="accent-[var(--color-accent)]" />
            First
            <input value={count} onChange={e => setCount(e.target.value)} type="number" min="1" disabled={fillAll}
              className="w-16 border border-[var(--color-border)] rounded px-2 py-0.5 text-sm disabled:opacity-50" />
            rows
          </label>
        </div>
      </div>
      {preview.length > 0 && (
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Preview</label>
          <div className="flex gap-2">
            {preview.map((val, i) => (
              <div key={i} className="flex-1 text-center py-1.5 rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] text-sm font-mono font-medium">{val}</div>
            ))}
            {n > 5 && <div className="flex-1 text-center py-1.5 rounded-lg bg-[var(--color-bg)] text-[var(--color-muted)] text-sm">…</div>}
          </div>
        </div>
      )}
      <div className="flex justify-end pt-1">
        <button onClick={handleAdd} disabled={!canAdd}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40">
          Add Column
        </button>
      </div>
    </div>
  )
}

// ─── Random section ───────────────────────────────────────────────────────────

type RandDist = 'normal' | 'uniform' | 'binomial' | 'geometric'

function RandomSection({ onClose }: { onClose: () => void }) {
  const { grid, addRandomColumn } = useStore()
  const [name, setName] = useState('')
  const [dist, setDist] = useState<RandDist>('normal')
  const [mean, setMean] = useState('0')
  const [sd, setSd] = useState('1')
  const [uMin, setUMin] = useState('1')
  const [uMax, setUMax] = useState('10')
  const [bN, setBN] = useState('10')
  const [bP, setBP] = useState('0.5')
  const [gP, setGP] = useState('0.5')
  const [rowCount, setRowCount] = useState(String(grid.rows.length || 20))

  const n = parseInt(rowCount) || 0
  const canAdd = name.trim() !== '' && n > 0

  function getParams(): Record<string, number> {
    if (dist === 'normal') return { mean: parseFloat(mean), sd: parseFloat(sd) }
    if (dist === 'uniform') return { min: parseFloat(uMin), max: parseFloat(uMax) }
    if (dist === 'binomial') return { n: parseInt(bN), p: parseFloat(bP) }
    return { p: parseFloat(gP) }
  }

  function handleAdd() {
    if (!canAdd) return
    addRandomColumn(name.trim(), dist, getParams(), n)
    setName('')
    onClose()
  }

  const distLabels: Record<RandDist, string> = {
    normal: 'Normal',
    uniform: 'Uniform Integer',
    binomial: 'Binomial',
    geometric: 'Geometric',
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Random Variable</h3>
        <p className="text-xs text-[var(--color-muted)]">Generate random values from a probability distribution.</p>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Column name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. sim_data"
          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-2 block">Distribution</label>
        <div className="flex gap-2 flex-wrap">
          {(['normal', 'uniform', 'binomial', 'geometric'] as RandDist[]).map(d => (
            <button key={d} onClick={() => setDist(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${dist === d ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-bg)]'}`}>
              {distLabels[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {dist === 'normal' && (
          <>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Mean (μ)</label>
              <input value={mean} onChange={e => setMean(e.target.value)} type="number"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Std Dev (σ)</label>
              <input value={sd} onChange={e => setSd(e.target.value)} type="number" min="0"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          </>
        )}
        {dist === 'uniform' && (
          <>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Min</label>
              <input value={uMin} onChange={e => setUMin(e.target.value)} type="number"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Max</label>
              <input value={uMax} onChange={e => setUMax(e.target.value)} type="number"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          </>
        )}
        {dist === 'binomial' && (
          <>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Trials (n)</label>
              <input value={bN} onChange={e => setBN(e.target.value)} type="number" min="1"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Prob. of success (p)</label>
              <input value={bP} onChange={e => setBP(e.target.value)} type="number" min="0" max="1" step="0.01"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          </>
        )}
        {dist === 'geometric' && (
          <div>
            <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Prob. of success (p)</label>
            <input value={gP} onChange={e => setGP(e.target.value)} type="number" min="0.001" max="1" step="0.01"
              className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Number of values</label>
          <input value={rowCount} onChange={e => setRowCount(e.target.value)} type="number" min="1"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <button onClick={handleAdd} disabled={!canAdd}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40">
          Generate Column
        </button>
      </div>
    </div>
  )
}

// ─── Stack section ────────────────────────────────────────────────────────────

function StackSection({ onClose }: { onClose: () => void }) {
  const { grid, stackColumns } = useStore()
  const [valueColIds, setValueColIds] = useState<string[]>([])
  const [keepColIds, setKeepColIds] = useState<string[]>([])
  const [valueName, setValueName] = useState('value')
  const [groupName, setGroupName] = useState('variable')
  const [error, setError] = useState<string | null>(null)

  const toggleValue = (id: string) =>
    setValueColIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const toggleKeep = (id: string) =>
    setKeepColIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const availableKeep = grid.columns.filter(c => !valueColIds.includes(c.id))
  const canStack = valueColIds.length > 0 && valueName.trim() !== '' && groupName.trim() !== ''

  function handleStack() {
    if (!canStack) return
    const result = stackColumns(valueColIds, keepColIds, valueName.trim(), groupName.trim())
    if (result.error) { setError(result.error); return }
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Stack Columns</h3>
        <p className="text-xs text-[var(--color-muted)]">Convert wide format to long — selected columns become rows with a group label.</p>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">Value columns to stack</label>
        <div className="flex flex-wrap gap-1.5 border border-[var(--color-border)] rounded-lg p-2 max-h-32 overflow-y-auto">
          {grid.columns.map(col => (
            <label key={col.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer border transition-colors ${valueColIds.includes(col.id) ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]' : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-bg)]'}`}>
              <input type="checkbox" checked={valueColIds.includes(col.id)} onChange={() => toggleValue(col.id)} className="hidden" />
              {col.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1.5 block">Keep columns (repeat per row)</label>
        <div className="flex flex-wrap gap-1.5 border border-[var(--color-border)] rounded-lg p-2 max-h-24 overflow-y-auto">
          {availableKeep.length === 0 && <span className="text-xs text-[var(--color-muted)]">Select value columns first</span>}
          {availableKeep.map(col => (
            <label key={col.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer border transition-colors ${keepColIds.includes(col.id) ? 'bg-[var(--color-text)] text-white border-[var(--color-text)]' : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-bg)]'}`}>
              <input type="checkbox" checked={keepColIds.includes(col.id)} onChange={() => toggleKeep(col.id)} className="hidden" />
              {col.name}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Group column name</label>
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="variable"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Value column name</label>
          <input value={valueName} onChange={e => setValueName(e.target.value)} placeholder="value"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
        </div>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex justify-end pt-1">
        <button onClick={handleStack} disabled={!canStack}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40">
          Stack Columns
        </button>
      </div>
    </div>
  )
}

// ─── Unstack section ──────────────────────────────────────────────────────────

function UnstackSection({ onClose }: { onClose: () => void }) {
  const { grid, unstackColumns } = useStore()
  const [valueColId, setValueColId] = useState<string>('')
  const [groupColId, setGroupColId] = useState<string>('')
  const [idColId, setIdColId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const canUnstack = valueColId !== '' && groupColId !== '' && valueColId !== groupColId

  function handleUnstack() {
    if (!canUnstack) return
    const result = unstackColumns(valueColId, groupColId, idColId || null)
    if (result.error) { setError(result.error); return }
    onClose()
  }

  const idOptions = grid.columns.filter(c => c.id !== valueColId && c.id !== groupColId)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Unstack Columns</h3>
        <p className="text-xs text-[var(--color-muted)]">Convert long format to wide — group column values become new columns.</p>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Value column</label>
        <select value={valueColId} onChange={e => setValueColId(e.target.value)}
          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-white">
          <option value="">Select column…</option>
          {grid.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">Group column (values become new column names)</label>
        <select value={groupColId} onChange={e => setGroupColId(e.target.value)}
          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-white">
          <option value="">Select column…</option>
          {grid.columns.filter(c => c.id !== valueColId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">ID column <span className="text-[var(--color-muted)] font-normal">(optional — groups rows with same ID)</span></label>
        <select value={idColId} onChange={e => setIdColId(e.target.value)}
          className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-white">
          <option value="">None</option>
          {idOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex justify-end pt-1">
        <button onClick={handleUnstack} disabled={!canUnstack}
          className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40">
          Unstack Columns
        </button>
      </div>
    </div>
  )
}

// ─── Filter section ───────────────────────────────────────────────────────────

const NUMERIC_OPS: FilterOp[] = ['=', '≠', '<', '≤', '>', '≥', 'between']
const CAT_OPS: FilterOp[] = ['is', 'is not', 'contains', 'one of']

function FilterSection() {
  const { grid, activeFilters, setRowFilters } = useStore()

  function addFilter() {
    const firstCol = grid.columns[0]
    if (!firstCol) return
    const newFilter: RowFilter = {
      id: uuid(),
      colId: firstCol.id,
      colName: firstCol.name,
      colType: firstCol.type,
      op: firstCol.type === 'numeric' ? '=' : 'is',
      value: '',
    }
    setRowFilters([...activeFilters, newFilter])
  }

  function updateFilter(id: string, patch: Partial<RowFilter>) {
    setRowFilters(activeFilters.map(f => {
      if (f.id !== id) return f
      const updated = { ...f, ...patch }
      // If column changed, reset op and values
      if (patch.colId !== undefined) {
        const col = grid.columns.find(c => c.id === patch.colId)
        if (col) {
          updated.colName = col.name
          updated.colType = col.type
          updated.op = col.type === 'numeric' ? '=' : 'is'
          updated.value = ''
          updated.value2 = undefined
        }
      }
      // If op changed, clear value2 if not between
      if (patch.op !== undefined && patch.op !== 'between') {
        updated.value2 = undefined
      }
      return updated
    }))
  }

  function removeFilter(id: string) {
    setRowFilters(activeFilters.filter(f => f.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-0.5">Filter Rows</h3>
        <p className="text-xs text-[var(--color-muted)]">Hide rows that don&apos;t match your conditions. Filters are non-destructive — your data is unchanged.</p>
      </div>

      {activeFilters.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-muted)] text-sm border border-dashed border-[var(--color-border)] rounded-xl">
          No filters active — all rows are shown.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeFilters.map(filter => {
            const ops = filter.colType === 'numeric' ? NUMERIC_OPS : CAT_OPS
            return (
              <div key={filter.id} className="flex items-center gap-2 p-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)]">
                {/* Column select */}
                <select
                  value={filter.colId}
                  onChange={e => updateFilter(filter.id, { colId: e.target.value })}
                  className="text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 bg-white min-w-0 flex-shrink-0"
                  style={{ maxWidth: 120 }}
                >
                  {grid.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {/* Op select */}
                <select
                  value={filter.op}
                  onChange={e => updateFilter(filter.id, { op: e.target.value as FilterOp })}
                  className="text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 bg-white flex-shrink-0"
                >
                  {ops.map(op => <option key={op} value={op}>{op}</option>)}
                </select>

                {/* Value inputs */}
                <input
                  value={filter.value}
                  onChange={e => updateFilter(filter.id, { value: e.target.value })}
                  placeholder="value"
                  className="text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 bg-white flex-1 min-w-0"
                />
                {filter.op === 'between' && (
                  <>
                    <span className="text-xs text-[var(--color-muted)] flex-shrink-0">and</span>
                    <input
                      value={filter.value2 ?? ''}
                      onChange={e => updateFilter(filter.id, { value2: e.target.value })}
                      placeholder="value"
                      className="text-xs border border-[var(--color-border)] rounded-md px-2 py-1.5 bg-white flex-1 min-w-0"
                    />
                  </>
                )}

                <button onClick={() => removeFilter(filter.id)} className="flex-shrink-0 text-[var(--color-muted)] hover:text-[var(--color-danger)]">
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={addFilter} disabled={grid.columns.length === 0}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:opacity-80 disabled:opacity-40">
        <Plus size={13} /> Add Filter
      </button>

      {activeFilters.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setRowFilters([])} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  defaultSection?: Section
}

export function DataOperationsModal({ open, onClose, defaultSection }: Props) {
  const [section, setSection] = useState<Section>(defaultSection ?? 'computed')
  const { activeFilters } = useStore()

  useEffect(() => {
    if (defaultSection) setSection(defaultSection)
  }, [defaultSection, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-xl flex overflow-hidden"
        style={{
          width: 'min(980px, calc(100vw - 2rem))',
          height: 'min(720px, calc(100vh - 2rem))',
          maxHeight: 'calc(100vh - 2rem)',
        }}
      >

        {/* Left sidebar */}
        <div className="w-44 flex-shrink-0 bg-[var(--color-bg)] border-r border-[var(--color-border)] py-4 overflow-y-auto">
          <div className="px-3 pb-2 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text)] text-sm">Data</h2>
          </div>
          {NAV.map(group => (
            <div key={group.group} className="mb-3">
              <div className="px-3 py-1 text-[10px] font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wider">{group.group}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    section === item.id
                      ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {item.label}
                  {item.id === 'filter' && activeFilters.length > 0 && (
                    <span className="text-[10px] bg-[var(--color-accent)] text-white rounded-full px-1.5 py-0.5 leading-none">{activeFilters.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-1 flex-shrink-0">
            <span /> {/* spacer */}
            <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {section === 'computed'    && <ComputedSection onClose={onClose} />}
            {section === 'sequential'  && <SequentialSection onClose={onClose} />}
            {section === 'random'      && <RandomSection onClose={onClose} />}
            {section === 'stack'       && <StackSection onClose={onClose} />}
            {section === 'unstack'     && <UnstackSection onClose={onClose} />}
            {section === 'filter'      && <FilterSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
