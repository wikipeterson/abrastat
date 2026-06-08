'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@/lib/store'
import { GridColumn } from '@/types'
import { getNumericValues, getNumericGroup, getValidStringValues } from '@/lib/gridHelpers'
import { computeSummary, getFrequencyTable } from '@/lib/statistics'
import { NumericStatsTable, NumericTableRow, CategoricalStatCard, TwoWayTableCard } from '@/components/stats/StatCard'
import { SummaryCardConfig } from '@/lib/exploreTypes'
import { DropZone } from '../DropZone'
import { EmptyState } from '@/components/ui/EmptyState'

interface SummaryCardProps {
  cardId: string
  config: SummaryCardConfig
  onClearZone: (zone: string) => void
  onAssignZone: (zone: 'variable' | 'group', colId: string) => boolean
  onRemove: () => void
  hideHeader?: boolean
}

function MultiVarDropZone({ id, varCols, onClearVar, onAssignVar }: {
  id: string
  varCols: GridColumn[]
  onClearVar: (colId: string) => void
  onAssignVar: (colId: string) => boolean
}) {
  const { grid, selectedColumnIds } = useStore()
  const { setNodeRef, isOver } = useDroppable({ id })
  const buttonRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const validColumns = grid.columns
  const selectedColumns = validColumns.filter(col => selectedColumnIds.includes(col.id))
  const remainingColumns = validColumns.filter(col => !selectedColumnIds.includes(col.id))

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
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative flex-1 min-w-0">
      <div className="text-[10px] font-mono font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">Variable</div>
      <div
        ref={node => {
          setNodeRef(node)
          buttonRef.current = node
        }}
        onClick={() => setOpen(prev => !prev)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(prev => !prev)
          }
        }}
        role="button"
        tabIndex={0}
        className={`min-h-[2.25rem] flex flex-wrap gap-1 p-1.5 rounded-lg border transition-colors ${
          isOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
            : varCols.length === 0
              ? 'border-dashed border-[var(--color-border)] bg-[var(--color-bg)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg)]'
        }`}
      >
        {varCols.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)] self-center px-1">Drop or click to add</span>
        ) : (
          varCols.map(col => (
            <span
              key={col.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)]"
            >
              <span className="font-mono opacity-60">{col.type === 'numeric' ? '#' : 'A'}</span>
              {col.name}
              <button
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onClearVar(col.id)}
                className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
              >×</button>
            </span>
          ))
        )}
      </div>
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-80 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-card)]"
        >
          {selectedColumns.length > 0 && (
            <div className="px-2 pt-1 pb-2 text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
              Selected
            </div>
          )}
          {[...selectedColumns, ...remainingColumns.filter(col => !selectedColumnIds.includes(col.id))].map((col, index, all) => {
            const showDivider = selectedColumns.length > 0 && index === selectedColumns.length
            return (
              <div key={col.id}>
                {showDivider && (
                  <div className="px-2 pt-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                    All variables
                  </div>
                )}
                <button
                  type="button"
                  className={`flex min-h-[40px] w-full items-center justify-between gap-3 rounded-xl px-3 text-sm hover:bg-[var(--color-accent-light)] ${
                    varCols.some(existing => existing.id === col.id) ? 'bg-[var(--color-accent-light)]' : ''
                  }`}
                  onClick={() => {
                    const applied = onAssignVar(col.id)
                    if (applied) setOpen(false)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="opacity-70 text-xs font-mono">{col.type === 'numeric' ? '#' : 'A'}</span>
                    <span className="truncate">{col.name}</span>
                  </span>
                  {varCols.some(existing => existing.id === col.id) && (
                    <span className="text-xs font-semibold text-[var(--color-accent)]">Added</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SummaryCard({ cardId, config, onClearZone, onAssignZone, onRemove, hideHeader }: SummaryCardProps) {
  const { grid } = useStore()

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleNativeVarDrop(e: React.DragEvent) {
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    e.preventDefault()
    onAssignZone('variable', colId)
  }

  function handleNativeGroupDrop(e: React.DragEvent) {
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    e.preventDefault()
    onAssignZone('group', colId)
  }

  const varCols = config.variableColIds
    .map(id => grid.columns.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null)

  const groupCol = config.groupColId ? (grid.columns.find(c => c.id === config.groupColId) ?? null) : null

  const content = useMemo(() => {
    if (varCols.length === 0) return null

    const numericCols = varCols.filter(c => c.type === 'numeric')
    const categoricalCols = varCols.filter(c => c.type === 'categorical')

    // Two categorical variables → two-way table (complete cases only)
    if (numericCols.length === 0 && categoricalCols.length === 2) {
      const [colA, colB] = categoricalCols
      const pairs = grid.rows
        .map(r => [String(r[colA.id] ?? '').trim(), String(r[colB.id] ?? '').trim()] as [string, string])
        .filter(([a, b]) => a !== '' && b !== '')
      return [<TwoWayTableCard
        key="twoway"
        colAName={colA.name}
        colBName={colB.name}
        colAValues={pairs.map(p => p[0])}
        colBValues={pairs.map(p => p[1])}
      />]
    }

    const parts: React.ReactNode[] = []

    if (numericCols.length > 0) {
      let rows: NumericTableRow[]
      if (groupCol) {
        rows = numericCols.flatMap(col => {
          const allData = getNumericGroup(grid, col.id, groupCol.id)
          const uniqueGroups = [...new Set(allData.map(d => d.group))].sort()
          return uniqueGroups.map(group => ({
            label: numericCols.length > 1 ? `${col.name} | ${group}` : group,
            summary: computeSummary(
              allData.filter(d => d.group === group).map(d => d.value),
              col.name,
            ),
          }))
        })
      } else {
        rows = numericCols.map(col => ({
          label: numericCols.length > 1 ? col.name : null,
          summary: computeSummary(getNumericValues(grid, col.id), col.name),
        }))
      }
      parts.push(
        <NumericStatsTable
          key="numeric"
          colName={numericCols.length === 1 ? numericCols[0].name : 'Variable'}
          rows={rows}
          groupColName={groupCol?.name}
          rowLabelHeader={numericCols.length > 1 ? 'Variable' : undefined}
        />
      )
    }

    for (const col of categoricalCols) {
      const values = getValidStringValues(grid, col.id)
      parts.push(<CategoricalStatCard key={col.id} column={col.name} rows={getFrequencyTable(values)} />)
    }

    return parts
  }, [grid, varCols, groupCol])

  return (
    <div className={hideHeader ? '' : 'bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] overflow-hidden'}>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-mono font-semibold text-[var(--color-muted)] uppercase tracking-wide">Summary Stats</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0" onDragOver={handleNativeDragOver} onDrop={handleNativeVarDrop}>
            <MultiVarDropZone
              id={`${cardId}:variable`}
              varCols={varCols}
              onClearVar={colId => onClearZone(`variable:${colId}`)}
              onAssignVar={colId => onAssignZone('variable', colId)}
            />
          </div>
          <div className="w-40 flex-shrink-0">
            <div onDragOver={handleNativeDragOver} onDrop={handleNativeGroupDrop}>
              <DropZone id={`${cardId}:group`} label="Group by" hint="categorical (optional)"
                assignedCol={groupCol} onClear={() => onClearZone('group')} onAssign={colId => onAssignZone('group', colId)} allowedTypes={['categorical']} />
            </div>
          </div>
        </div>

        {varCols.length === 0 ? (
          <EmptyState icon="📊" title="Drop or click a variable above" description="Use the variable zone to add one or more columns and view their statistics." />
        ) : content}
      </div>
    </div>
  )
}
