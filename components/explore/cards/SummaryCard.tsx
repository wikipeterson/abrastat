'use client'

import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useStore } from '@/lib/store'
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
  onRemove: () => void
  hideHeader?: boolean
}

function MultiVarDropZone({ id, varCols, onClearVar }: {
  id: string
  varCols: { id: string; name: string; type: string }[]
  onClearVar: (colId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">Variable</div>
      <div
        ref={setNodeRef}
        className={`min-h-[2.25rem] flex flex-wrap gap-1 p-1.5 rounded-lg border transition-colors ${
          isOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
            : varCols.length === 0
              ? 'border-dashed border-[var(--color-border)] bg-slate-50'
              : 'border-[var(--color-border)] bg-slate-50'
        }`}
      >
        {varCols.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)] self-center px-1">drop variables here</span>
        ) : (
          varCols.map(col => (
            <span
              key={col.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-gold-light)] text-[#5A3A00] ring-2 ring-inset ring-[var(--color-gold)]"
            >
              <span className="font-mono opacity-60">{col.type === 'numeric' ? '#' : 'A'}</span>
              {col.name}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onClearVar(col.id)}
                className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
              >×</button>
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export function SummaryCard({ cardId, config, onClearZone, onRemove, hideHeader }: SummaryCardProps) {
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
    const current = useStore.getState().exploreCards.find(c => c.id === cardId)
    if (!current || current.config.type !== 'summary') return
    if (current.config.variableColIds.includes(colId)) return
    useStore.getState().updateExploreCard(cardId, {
      config: {
        ...current.config,
        variableColIds: [...current.config.variableColIds, colId],
      },
    })
  }

  function handleNativeGroupDrop(e: React.DragEvent) {
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    e.preventDefault()
    const current = useStore.getState().exploreCards.find(c => c.id === cardId)
    if (!current || current.config.type !== 'summary') return
    useStore.getState().updateExploreCard(cardId, {
      config: {
        ...current.config,
        groupColId: colId,
      },
    })
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
          <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Summary Stats</span>
          <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
        </div>
      )}

      <div className={hideHeader ? 'space-y-3' : 'p-4 space-y-3'}>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0" onDragOver={handleNativeDragOver} onDrop={handleNativeVarDrop}>
            <MultiVarDropZone
              id={`${cardId}:variable`}
              varCols={varCols}
              onClearVar={colId => onClearZone(`variable:${colId}`)}
            />
          </div>
          <div className="w-40 flex-shrink-0">
            <div onDragOver={handleNativeDragOver} onDrop={handleNativeGroupDrop}>
              <DropZone id={`${cardId}:group`} label="Group by" hint="categorical (optional)"
                assignedCol={groupCol} onClear={() => onClearZone('group')} />
            </div>
          </div>
        </div>

        {varCols.length === 0 ? (
          <EmptyState icon="📊" title="Drop a variable above" description="Drag any variable from the sidebar to see its statistics." />
        ) : content}
      </div>
    </div>
  )
}
