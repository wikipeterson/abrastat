'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { GridColumn, RecodeRule } from '@/types'
import { useStore } from '@/lib/store'

interface Props {
  column: GridColumn
  onClose: () => void
}

function defaultRule(): RecodeRule {
  return { id: uuid(), minVal: '', minOp: '>=', maxVal: '', maxOp: '<=', label: '' }
}

export function RecodeModal({ column, onClose }: Props) {
  const { grid, recodeColumn } = useStore()
  const [newName, setNewName] = useState(`${column.name}_cat`)
  const [rules, setRules] = useState<RecodeRule[]>([defaultRule()])

  function updateRule(id: string, patch: Partial<RecodeRule>) {
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function addRule() {
    setRules(rs => [...rs, defaultRule()])
  }

  function removeRule(id: string) {
    setRules(rs => rs.filter(r => r.id !== id))
  }

  function applyRule(val: number, rule: RecodeRule): boolean {
    const minOk = rule.minVal === '' || (rule.minOp === '>=' ? val >= Number(rule.minVal) : val > Number(rule.minVal))
    const maxOk = rule.maxVal === '' || (rule.maxOp === '<=' ? val <= Number(rule.maxVal) : val < Number(rule.maxVal))
    return minOk && maxOk
  }

  function getLabelForValue(val: string): string {
    const n = Number(val)
    if (val === '' || !isFinite(n)) return ''
    for (const rule of rules) {
      if (applyRule(n, rule)) return rule.label || '(no label)'
    }
    return ''
  }

  const previewRows = grid.rows
    .filter(r => {
      const v = r[column.id]
      return v !== '' && v !== undefined && isFinite(Number(v))
    })
    .slice(0, 6)

  const canCreate = newName.trim() !== '' && rules.length > 0 && rules.every(r => r.label.trim() !== '')

  function handleCreate() {
    if (!canCreate) return
    recodeColumn(column.id, newName.trim(), rules)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col gap-5 p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[var(--color-text)] text-base">Recode into Categories</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Source: <span className="font-medium">{column.name}</span></p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        {/* Output name */}
        <div>
          <label className="text-xs font-medium text-[var(--color-muted)] mb-1 block">New variable name</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        {/* Rules table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[var(--color-muted)]">Rules (first match wins)</label>
            <button
              onClick={addRule}
              className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-teal-700 font-medium"
            >
              <Plus size={12} /> Add Rule
            </button>
          </div>

          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="grid text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide bg-slate-50 px-3 py-1.5"
              style={{ gridTemplateColumns: '80px 80px 16px 80px 80px 1fr 28px' }}>
              <span>Min op</span>
              <span>Min value</span>
              <span></span>
              <span>Max value</span>
              <span>Max op</span>
              <span>Label</span>
              <span></span>
            </div>
            {rules.map((rule, i) => (
              <div
                key={rule.id}
                className="grid items-center gap-1 px-3 py-1.5 border-t border-[var(--color-border)]"
                style={{ gridTemplateColumns: '80px 80px 16px 80px 80px 1fr 28px' }}
              >
                <select
                  value={rule.minOp}
                  onChange={e => updateRule(rule.id, { minOp: e.target.value as '>=' | '>' })}
                  className="text-xs border border-[var(--color-border)] rounded px-1.5 py-1 bg-white"
                >
                  <option value=">=">&ge;</option>
                  <option value=">">&gt;</option>
                </select>
                <input
                  value={rule.minVal}
                  onChange={e => updateRule(rule.id, { minVal: e.target.value })}
                  placeholder="(−∞)"
                  className="text-xs border border-[var(--color-border)] rounded px-1.5 py-1 w-full"
                />
                <span className="text-center text-[var(--color-muted)] text-xs">–</span>
                <input
                  value={rule.maxVal}
                  onChange={e => updateRule(rule.id, { maxVal: e.target.value })}
                  placeholder="(+∞)"
                  className="text-xs border border-[var(--color-border)] rounded px-1.5 py-1 w-full"
                />
                <select
                  value={rule.maxOp}
                  onChange={e => updateRule(rule.id, { maxOp: e.target.value as '<=' | '<' })}
                  className="text-xs border border-[var(--color-border)] rounded px-1.5 py-1 bg-white"
                >
                  <option value="<=">&le;</option>
                  <option value="<">&lt;</option>
                </select>
                <input
                  value={rule.label}
                  onChange={e => updateRule(rule.id, { label: e.target.value })}
                  placeholder={`Category ${i + 1}`}
                  className="text-xs border border-[var(--color-border)] rounded px-1.5 py-1 w-full"
                />
                <button
                  onClick={() => removeRule(rule.id)}
                  disabled={rules.length === 1}
                  className="flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-30"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        {previewRows.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--color-muted)] mb-2 block">Preview</label>
            <div className="grid gap-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {previewRows.map((row, i) => {
                const val = String(row[column.id])
                const label = getLabelForValue(val)
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[var(--color-muted)] w-16 text-right">{val}</span>
                    <span className="text-slate-400">→</span>
                    <span className={`font-medium ${label ? 'text-[var(--color-accent)]' : 'text-slate-400 italic'}`}>
                      {label || '(no match)'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-40"
          >
            Create Variable
          </button>
        </div>
      </div>
    </div>
  )
}
