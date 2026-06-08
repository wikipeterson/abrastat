'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, Link2, Download } from 'lucide-react'
import { DatasetMeta } from '@/types'
import { DatasetCoverThumb } from './DatasetCoverThumb'

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

interface DatasetCardProps {
  dataset: DatasetMeta
  currentUserId?: string
  onOpen: (id: string) => void
  onDelete?: (id: string) => void
  onExport?: (dataset: DatasetMeta, format: 'csv' | 'xlsx') => void | Promise<void>
  view?: 'list' | 'card'
}

function CopyLinkButton({ datasetId }: { datasetId: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/d/${datasetId}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      window.prompt('Copy this link:', url)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy share link"
      className="p-1 rounded hover:bg-[var(--color-accent-light)] text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-all"
    >
      {copied ? <span className="text-xs font-medium text-[var(--color-accent)] px-1">Copied!</span> : <Link2 size={14} />}
    </button>
  )
}

function ExportButton({
  dataset,
  onExport,
}: {
  dataset: DatasetMeta
  onExport: (dataset: DatasetMeta, format: 'csv' | 'xlsx') => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    if (!open) return
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        title="Export dataset"
        className="p-1 rounded hover:bg-[var(--color-accent-light)] text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-all"
      >
        <Download size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[124px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-lg">
          <button
            onClick={e => {
              e.stopPropagation()
              setOpen(false)
              void onExport(dataset, 'csv')
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
          >
            Export CSV
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              setOpen(false)
              void onExport(dataset, 'xlsx')
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
          >
            Export XLSX
          </button>
        </div>
      )}
    </div>
  )
}

export function DatasetCard({ dataset, currentUserId, onOpen, onDelete, onExport, view = 'list' }: DatasetCardProps) {
  const isOwner = dataset.ownerId === currentUserId
  const canDelete = isOwner && onDelete
  const isSample = dataset.id.startsWith('sample:')

  if (view === 'card') {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-4 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onOpen(dataset.id)}>
        <div className="flex items-start justify-between">
          <DatasetCoverThumb cover={dataset.emoji} size="md" />
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
            {onExport && <ExportButton dataset={dataset} onExport={onExport} />}
            <CopyLinkButton datasetId={dataset.id} />
            {canDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete!(dataset.id) }}
                className="p-1 rounded hover:bg-[var(--color-danger-light)] text-[var(--color-danger)] transition-all"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <div>
          <p className="font-serif italic font-semibold text-[var(--color-text)] truncate">{dataset.name}</p>
          {dataset.description && <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2">{dataset.description}</p>}
          {dataset.source && (
            <p className="text-[11px] text-[var(--color-muted)] mt-1 truncate" title={dataset.citation || dataset.source}>
              Source: {dataset.source}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mt-auto">
          <span>{dataset.ownerName}</span>
          <span>{dataset.rowCount.toLocaleString()} rows</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-[var(--color-bg)] rounded-xl group cursor-pointer" onClick={() => onOpen(dataset.id)}>
      <DatasetCoverThumb cover={dataset.emoji} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--color-text)] truncate">{dataset.name}</p>
        {dataset.description && <p className="text-xs text-[var(--color-muted)] truncate">{dataset.description}</p>}
        {dataset.source && (
          <p className="text-[11px] text-[var(--color-muted)] truncate" title={dataset.citation || dataset.source}>
            Source: {dataset.source}
          </p>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-6 text-xs text-[var(--color-muted)] flex-shrink-0">
        <span className="w-28 truncate">{dataset.ownerName}</span>
        <span className="w-20">{isSample ? 'Built-in' : timeAgo(dataset.updatedAt)}</span>
        <span className="w-16 text-right">{dataset.rowCount.toLocaleString()} rows</span>
      </div>
      <div className="flex sm:opacity-0 sm:group-hover:opacity-100 items-center gap-1 transition-all">
        {onExport && <ExportButton dataset={dataset} onExport={onExport} />}
        <CopyLinkButton datasetId={dataset.id} />
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete!(dataset.id) }}
            className="p-1 rounded hover:bg-[var(--color-danger-light)] text-[var(--color-danger)] transition-all"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
