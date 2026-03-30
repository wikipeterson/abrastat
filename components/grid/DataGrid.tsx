'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { EditableCell } from './EditableCell'
import { ColumnHeader } from './ColumnHeader'

const MIN_EMPTY_ROWS = 5
const COL_WIDTH = 140
const ROW_NUM_WIDTH = 48
const DRAG_PREVIEW_ROWS = 6

function createColumnDragPreview(columnName: string, values: Array<string | number>) {
  const preview = document.createElement('div')
  preview.style.position = 'fixed'
  preview.style.top = '-9999px'
  preview.style.left = '-9999px'
  preview.style.width = `${COL_WIDTH}px`
  preview.style.borderRadius = '14px'
  preview.style.overflow = 'hidden'
  preview.style.background = '#ffffff'
  preview.style.border = '1px solid rgba(148, 163, 184, 0.35)'
  preview.style.boxShadow = '0 20px 45px rgba(15, 23, 42, 0.18)'
  preview.style.fontFamily = 'inherit'

  const header = document.createElement('div')
  header.style.height = '32px'
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.padding = '0 10px'
  header.style.background = 'var(--color-grid-header)'
  header.style.color = '#ffffff'
  header.style.fontSize = '12px'
  header.style.fontWeight = '600'
  header.style.borderBottom = '1px solid rgba(255,255,255,0.08)'
  header.textContent = columnName
  preview.appendChild(header)

  values.slice(0, DRAG_PREVIEW_ROWS).forEach((value, index) => {
    const cell = document.createElement('div')
    cell.style.height = '36px'
    cell.style.display = 'flex'
    cell.style.alignItems = 'center'
    cell.style.padding = '0 10px'
    cell.style.fontSize = '13px'
    cell.style.color = '#0f172a'
    cell.style.background = index % 2 === 0 ? '#ffffff' : '#f8fafc'
    cell.style.borderBottom = '1px solid rgba(226, 232, 240, 0.9)'
    cell.style.whiteSpace = 'nowrap'
    cell.style.overflow = 'hidden'
    cell.style.textOverflow = 'ellipsis'
    cell.textContent = String(value ?? '')
    preview.appendChild(cell)
  })

  document.body.appendChild(preview)
  return preview
}

export function DataGrid() {
  const { grid, updateCell, addRow, deleteRows, undo, reorderColumns } = useStore()
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIndex: number } | null>(null)
  const [dragColIdx, setDragColIdx] = useState<number | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)

  // Ensure enough empty rows
  const { columns, rows } = grid
  const lastDataRow = rows.reduceRight((found, row, i) => {
    if (found !== -1) return found
    return Object.values(row).some(v => String(v).trim()) ? i : -1
  }, -1)
  const targetRows = Math.max(rows.length, lastDataRow + 1 + MIN_EMPTY_ROWS)

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!activeCell) return
      const { row, col } = activeCell
      const numRows = targetRows
      const numCols = columns.length

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      const nav: Record<string, () => void> = {
        Tab: () => setActiveCell(col + 1 < numCols ? { row, col: col + 1 } : row + 1 < numRows ? { row: row + 1, col: 0 } : activeCell),
        'Shift+Tab': () => setActiveCell(col > 0 ? { row, col: col - 1 } : row > 0 ? { row: row - 1, col: numCols - 1 } : activeCell),
        Enter: () => setActiveCell(row + 1 < numRows ? { row: row + 1, col } : activeCell),
        'Shift+Enter': () => setActiveCell(row > 0 ? { row: row - 1, col } : activeCell),
        ArrowRight: () => setActiveCell(col + 1 < numCols ? { row, col: col + 1 } : activeCell),
        ArrowLeft: () => setActiveCell(col > 0 ? { row, col: col - 1 } : activeCell),
        ArrowDown: () => setActiveCell(row + 1 < numRows ? { row: row + 1, col } : activeCell),
        ArrowUp: () => setActiveCell(row > 0 ? { row: row - 1, col } : activeCell),
      }

      const key = (e.shiftKey && e.key !== 'Tab' ? 'Shift+' : '') + (e.shiftKey && e.key === 'Tab' ? 'Shift+Tab' : e.key)
      if (nav[key] && (e.key.startsWith('Arrow') || e.key === 'Tab' || e.key === 'Enter')) {
        if (e.key !== 'Tab') e.preventDefault()
        nav[key]()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeCell, columns.length, targetRows, undo])

  function handleRowContextMenu(e: React.MouseEvent, rowIndex: number) {
    e.preventDefault()
    if (!selectedRows.has(rowIndex)) setSelectedRows(new Set([rowIndex]))
    setContextMenu({ x: e.clientX, y: e.clientY, rowIndex })
  }

  function handleRowClick(rowIndex: number) {
    setSelectedRows(new Set([rowIndex]))
    setActiveCell(null)
  }

  const handleCellChange = useCallback((rowIndex: number, colId: string, value: string) => {
    updateCell(rowIndex, colId, value)
  }, [updateCell])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  useEffect(() => {
    return () => {
      if (dragPreviewRef.current) {
        dragPreviewRef.current.remove()
        dragPreviewRef.current = null
      }
    }
  }, [])

  function getColumnShift(colIndex: number) {
    if (dragColIdx === null || dropTargetIdx === null || dragColIdx === dropTargetIdx) return 0
    if (dragColIdx < dropTargetIdx && colIndex > dragColIdx && colIndex <= dropTargetIdx) return -COL_WIDTH
    if (dragColIdx > dropTargetIdx && colIndex >= dropTargetIdx && colIndex < dragColIdx) return COL_WIDTH
    return 0
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto border border-[var(--color-border)] rounded-lg"
      style={{ maxHeight: 'calc(100vh - 220px)' }}
    >
      <div style={{ minWidth: ROW_NUM_WIDTH + columns.length * COL_WIDTH }}>
        {/* Header row */}
        <div className="flex sticky top-0 z-20">
          <div
            className="flex-shrink-0 bg-[var(--color-grid-header)]"
            style={{ width: ROW_NUM_WIDTH }}
          />
          {columns.map((col, colIndex) => {
            const isTarget = dropTargetIdx === colIndex && dragColIdx !== null && dragColIdx !== colIndex
            const isDraggingCol = dragColIdx === colIndex
            const shiftX = getColumnShift(colIndex)
            return (
              <div
                key={col.id}
                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                className={`group/col relative transition-[transform,opacity,box-shadow] duration-200 ease-out ${
                  isTarget ? 'z-10' : ''
                }`}
                draggable
                onDragStart={e => {
                  setDragColIdx(colIndex)
                  setDropTargetIdx(colIndex)
                  e.dataTransfer.effectAllowed = 'move'
                  // Needed for Firefox
                  e.dataTransfer.setData('text/plain', String(colIndex))
                  if (dragPreviewRef.current) {
                    dragPreviewRef.current.remove()
                    dragPreviewRef.current = null
                  }
                  const values = Array.from({ length: targetRows }, (_, rowIndex) => rows[rowIndex]?.[col.id] ?? '')
                  const preview = createColumnDragPreview(col.name, values)
                  dragPreviewRef.current = preview
                  e.dataTransfer.setDragImage(preview, 24, 20)
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dropTargetIdx !== colIndex) setDropTargetIdx(colIndex)
                }}
                onDragLeave={() => setDropTargetIdx(null)}
                onDrop={e => {
                  e.preventDefault()
                  if (dragColIdx !== null && dragColIdx !== colIndex) {
                    reorderColumns(dragColIdx, colIndex)
                  }
                  setDragColIdx(null)
                  setDropTargetIdx(null)
                  if (dragPreviewRef.current) {
                    dragPreviewRef.current.remove()
                    dragPreviewRef.current = null
                  }
                }}
                onDragEnd={() => {
                  setDragColIdx(null)
                  setDropTargetIdx(null)
                  if (dragPreviewRef.current) {
                    dragPreviewRef.current.remove()
                    dragPreviewRef.current = null
                  }
                }}
              >
                <div
                  style={{
                    transform: `translateX(${shiftX}px)`,
                    opacity: isDraggingCol ? 0.18 : 1,
                  }}
                  className={`transition-[transform,opacity,box-shadow] duration-200 ease-out ${
                    isDraggingCol ? 'shadow-none' : ''
                  }`}
                >
                  <ColumnHeader column={col} colIndex={colIndex} />
                </div>
                {isTarget && dragColIdx !== null && dragColIdx !== colIndex && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-1.5 rounded-full bg-[var(--color-accent)]/70 shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Data rows */}
        {Array.from({ length: targetRows }, (_, rowIndex) => {
          const row = rows[rowIndex] ?? {}
          return (
            <div key={rowIndex} className="flex group">
              {/* Row number */}
              <div
                style={{ width: ROW_NUM_WIDTH, minWidth: ROW_NUM_WIDTH }}
                className={`flex-shrink-0 flex items-center justify-center text-xs border-r border-b border-[var(--color-border)] cursor-pointer select-none ${selectedRows.has(rowIndex) ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-50 text-[var(--color-muted)]'}`}
                onClick={() => handleRowClick(rowIndex)}
                onContextMenu={e => handleRowContextMenu(e, rowIndex)}
              >
                {rowIndex + 1}
              </div>
              {/* Cells */}
              {columns.map((col, colIndex) => (
                <div
                  key={col.id}
                  style={{
                    width: COL_WIDTH,
                    minWidth: COL_WIDTH,
                    transform: `translateX(${getColumnShift(colIndex)}px)`,
                    opacity: dragColIdx === colIndex ? 0.18 : 1,
                  }}
                  className="transition-[transform,opacity] duration-200 ease-out"
                >
                  <EditableCell
                    value={row[col.id] ?? ''}
                    rowIndex={rowIndex}
                    colId={col.id}
                    isActive={activeCell?.row === rowIndex && activeCell?.col === colIndex}
                    isSelected={selectedRows.has(rowIndex)}
                    onActivate={() => { setActiveCell({ row: rowIndex, col: colIndex }); setSelectedRows(new Set()) }}
                    onChange={handleCellChange}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {[
            { label: 'Insert row above', action: () => addRow(contextMenu.rowIndex - 1) },
            { label: 'Insert row below', action: () => addRow(contextMenu.rowIndex) },
            { label: `Delete row${selectedRows.size > 1 ? 's' : ''}`, action: () => deleteRows([...selectedRows]), danger: true },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setContextMenu(null) }}
              className={`w-full text-left px-4 py-2 hover:bg-slate-50 ${item.danger ? 'text-red-500' : 'text-[var(--color-text)]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
