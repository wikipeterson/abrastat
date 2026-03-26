'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useStore } from '@/lib/store'
import { parsePastedText, parseFile } from '@/lib/parse'
import { GridState } from '@/types'

interface ImportPanelProps {
  open: boolean
  onClose: () => void
}

type Tab = 'paste' | 'file' | 'sheets'

export function ImportPanel({ open, onClose }: ImportPanelProps) {
  const [tab, setTab] = useState<Tab>('paste')
  const [preview, setPreview] = useState<GridState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasHeaders, setHasHeaders] = useState(true)
  const setGrid = useStore(s => s.setGrid)

  function reset() {
    setPreview(null)
    setError(null)
    setPasteText('')
    setSheetsUrl('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleConfirm() {
    if (!preview) return
    setGrid(preview)
    handleClose()
  }

  function handlePasteChange(text: string, hdr = hasHeaders) {
    setPasteText(text)
    setError(null)
    setPreview(null)
    if (!text.trim()) return
    try {
      setPreview(parsePastedText(text, hdr))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed.')
    }
  }

  function handleHeadersToggle(checked: boolean) {
    setHasHeaders(checked)
    if (pasteText.trim()) handlePasteChange(pasteText, checked)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setPreview(null)
    try {
      const parsed = await parseFile(file, hasHeaders)
      setPreview(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    }
    e.target.value = ''
  }

  async function handleSheetsImport() {
    if (!sheetsUrl.trim()) return
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const res = await fetch(`/api/import-sheets?url=${encodeURIComponent(sheetsUrl)}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Import failed.')
      }
      const csv = await res.text()
      const { parsePastedText: parseCsv } = await import('@/lib/parse')
      setPreview(parseCsv(csv))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'paste', label: 'Paste Data' },
    { id: 'file', label: 'Upload File' },
    { id: 'sheets', label: 'Google Sheets' },
  ]

  return (
    <Modal open={open} onClose={handleClose} title="Import Data" width="max-w-xl">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] -mt-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); reset() }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Paste */}
      {tab === 'paste' && (
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={e => handlePasteChange(e.target.value)}
            placeholder="Paste data from Excel, Google Sheets, or any table. Include a header row."
            rows={8}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          {preview && <PreviewTable grid={preview} />}
        </div>
      )}

      {/* File */}
      {tab === 'file' && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] rounded-xl py-10 cursor-pointer hover:border-[var(--color-accent)] transition-colors">
            <span className="text-3xl mb-2">📁</span>
            <span className="text-sm font-medium text-[var(--color-text)]">Drop a file or click to browse</span>
            <span className="text-xs text-[var(--color-muted)] mt-1">.csv  .tsv  .txt  .xlsx  .xls</span>
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {preview && <PreviewTable grid={preview} />}
        </div>
      )}

      {/* Google Sheets */}
      {tab === 'sheets' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Google Sheets URL</label>
            <div className="flex gap-2">
              <input
                value={sheetsUrl}
                onChange={e => setSheetsUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <button
                onClick={handleSheetsImport}
                disabled={loading || !sheetsUrl.trim()}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? '…' : 'Import'}
              </button>
            </div>
          </div>
          <details className="text-xs text-[var(--color-muted)]">
            <summary className="cursor-pointer font-medium">How to share your sheet publicly</summary>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>In Google Sheets, click Share (top right)</li>
              <li>Change to &ldquo;Anyone with the link&rdquo;</li>
              <li>Set role to &ldquo;Viewer&rdquo;</li>
              <li>Copy the link and paste it above</li>
            </ol>
          </details>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {preview && <PreviewTable grid={preview} />}
        </div>
      )}

      {tab !== 'sheets' && (
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)] mt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasHeaders}
            onChange={e => handleHeadersToggle(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          First row is variable names
        </label>
      )}

      {preview && (
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100">Cancel</button>
          <button onClick={handleConfirm} className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium">
            Load into AbraStat
          </button>
        </div>
      )}
    </Modal>
  )
}

function PreviewTable({ grid }: { grid: GridState }) {
  const previewRows = grid.rows.slice(0, 5)
  return (
    <div className="overflow-auto rounded-lg border border-[var(--color-border)]">
      <p className="text-xs text-[var(--color-muted)] px-3 py-1 bg-slate-50 border-b border-[var(--color-border)]">
        Preview — {grid.rows.length} rows × {grid.columns.length} columns
      </p>
      <table className="text-xs w-full">
        <thead>
          <tr className="bg-[var(--color-grid-header)] text-white">
            {grid.columns.map(col => (
              <th key={col.id} className="px-3 py-1.5 text-left font-medium border-r border-slate-600 last:border-0">{col.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--color-border)]">
              {grid.columns.map(col => (
                <td key={col.id} className="px-3 py-1.5 border-r border-[var(--color-border)] last:border-0">{String(row[col.id] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
