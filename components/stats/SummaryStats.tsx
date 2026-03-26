'use client'

import { useState, useMemo, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { computeSummary, getFrequencyTable } from '@/lib/statistics'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { NumericStatsTable, NumericTableRow, CategoricalStatCard, LinearRegressionCard, TwoWayTableCard } from './StatCard'
import { EmptyState } from '@/components/ui/EmptyState'

export function SummaryStats() {
  const { grid, selectedColumnIds, toggleColumnSelection, selectAllNumeric } = useStore()
  const [dragOver, setDragOver] = useState(false)
  const [groupDragOver, setGroupDragOver] = useState(false)
  const [groupColId, setGroupColId] = useState<string | null>(null)

  const selectedColumns = useMemo(
    () => grid.columns.filter(c => selectedColumnIds.includes(c.id)),
    [grid.columns, selectedColumnIds]
  )

  const groupCol = groupColId ? grid.columns.find(c => c.id === groupColId) ?? null : null

  // Clear groupColId if the column is removed from the grid
  useEffect(() => {
    const ids = grid.columns.map(c => c.id)
    if (groupColId && !ids.includes(groupColId)) setGroupColId(null)
  }, [grid.columns, groupColId])

  const results = useMemo(() => {
    return selectedColumns.map(col => {
      if (col.type === 'numeric') {
        let rows: NumericTableRow[]
        if (groupCol) {
          const allValues = getNumericValues(grid, col.id)
          const groups = getStringValues(grid, groupCol.id)
          const uniqueGroups = [...new Set(groups)].filter(Boolean).sort()
          rows = uniqueGroups.map(group => ({
            label: group,
            summary: computeSummary(allValues.filter((_, i) => groups[i] === group), col.name),
          }))
        } else {
          rows = [{ label: null, summary: computeSummary(getNumericValues(grid, col.id), col.name) }]
        }
        return { col, type: 'numeric' as const, rows }
      } else {
        const values = getStringValues(grid, col.id).filter(v => v.trim())
        return { col, type: 'categorical' as const, freqTable: getFrequencyTable(values) }
      }
    })
  }, [grid, selectedColumns, groupCol])

  const numericSelected = useMemo(() => selectedColumns.filter(c => c.type === 'numeric'), [selectedColumns])
  const categoricalSelected = useMemo(() => selectedColumns.filter(c => c.type === 'categorical'), [selectedColumns])

  const showRegression = numericSelected.length === 2 && !groupCol
  const showTwoWay = categoricalSelected.length === 2 && !groupCol

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const colId = e.dataTransfer.getData('text/plain')
    if (colId && !selectedColumnIds.includes(colId)) {
      toggleColumnSelection(colId)
    }
  }

  function handleGroupDrop(e: React.DragEvent) {
    e.preventDefault()
    setGroupDragOver(false)
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    const col = grid.columns.find(c => c.id === colId)
    if (col) setGroupColId(colId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Variable drop zones */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
        <div className="flex gap-3 items-start">
          {/* Variables zone */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Variables
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-wrap gap-2 min-h-[44px] p-2 rounded-xl border-2 transition-colors ${
                dragOver
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-dashed border-[var(--color-border)] bg-slate-50'
              }`}
            >
              {selectedColumns.map(col => (
                <div
                  key={col.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium"
                >
                  <span className="opacity-70 text-xs font-mono">{col.type === 'numeric' ? '#' : 'A'}</span>
                  <span>{col.name}</span>
                  <button
                    onClick={() => toggleColumnSelection(col.id)}
                    className="ml-1 opacity-70 hover:opacity-100 text-base leading-none"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              {selectedColumns.length === 0 && (
                <span className="text-xs text-[var(--color-muted)] italic self-center px-1">
                  Drag variables here
                </span>
              )}
            </div>
            {selectedColumns.length > 0 && (
              <div className="flex items-center gap-3 mt-1.5">
                <button onClick={selectAllNumeric} className="text-xs text-[var(--color-accent)] hover:underline">
                  Add all numeric
                </button>
                <button
                  onClick={() => selectedColumnIds.forEach(id => toggleColumnSelection(id))}
                  className="text-xs text-[var(--color-muted)] hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Group by zone */}
          <div className="w-52 flex-shrink-0">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Group by
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setGroupDragOver(true) }}
              onDragLeave={() => setGroupDragOver(false)}
              onDrop={handleGroupDrop}
              className={`flex flex-wrap gap-2 min-h-[44px] p-2 rounded-xl border-2 transition-colors ${
                groupDragOver
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-dashed border-[var(--color-border)] bg-slate-50'
              }`}
            >
              {groupCol ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-600 text-white text-sm font-medium">
                  <span className="opacity-70 text-xs font-mono">A</span>
                  <span>{groupCol.name}</span>
                  <button
                    onClick={() => setGroupColId(null)}
                    className="ml-1 opacity-70 hover:opacity-100 text-base leading-none"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-muted)] italic self-center px-1">
                  Drag a categorical variable
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {selectedColumns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="📊"
            title="No variables selected"
            description="Drag variables from the sidebar into the zone above to see summary statistics."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col gap-4 p-4">
            {/* Numeric tables — full width, one per variable */}
            {results.filter(r => r.type === 'numeric').map(r => (
              <NumericStatsTable
                key={r.col.id}
                colName={r.col.name}
                rows={r.rows}
                groupColName={groupCol?.name}
              />
            ))}

            {/* Categorical + regression cards in a grid */}
            {(results.some(r => r.type === 'categorical') || showRegression || showTwoWay) && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {results.filter(r => r.type === 'categorical').map(r => (
                  <CategoricalStatCard key={r.col.id} column={r.col.name} rows={r.freqTable} />
                ))}
                {showRegression && (() => {
                  const [colA, colB] = numericSelected
                  const xs = getNumericValues(grid, colA.id)
                  const ys = getNumericValues(grid, colB.id)
                  return xs.length >= 2 && ys.length >= 2
                    ? <LinearRegressionCard key="regression" xName={colA.name} yName={colB.name} xs={xs} ys={ys} />
                    : null
                })()}
                {showTwoWay && (() => {
                  const [colA, colB] = categoricalSelected
                  const aVals = getStringValues(grid, colA.id).filter(v => v.trim())
                  const bVals = getStringValues(grid, colB.id).filter(v => v.trim())
                  return <TwoWayTableCard key="twoway" colAName={colA.name} colBName={colB.name} colAValues={aVals} colBValues={bVals} />
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
