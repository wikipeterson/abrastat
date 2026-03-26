'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CoverPicker } from './CoverPicker'
import { DatasetCoverThumb } from './DatasetCoverThumb'
import { randomCoverId } from '@/lib/datasetCovers'
import { useStore } from '@/lib/store'
import { saveDataset, updateDatasetMeta, updateDatasetRows } from '@/lib/firestore'
import { useToast, Toast } from '@/components/ui/Toast'

interface SaveDatasetModalProps {
  open: boolean
  onClose: () => void
}

export function SaveDatasetModal({ open, onClose }: SaveDatasetModalProps) {
  const { user, grid, activeDatasetId, setActiveDatasetId, markClean } = useStore()
  const [cover, setCover] = useState(() => randomCoverId())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast, show: showToast, hide: hideToast } = useToast()

  // Assign a fresh random cover each time the modal opens for a new dataset
  useEffect(() => {
    if (open && !activeDatasetId) setCover(randomCoverId())
  }, [open, activeDatasetId])

  async function handleSave() {
    if (!user || !name.trim()) return
    setSaving(true)
    try {
      if (activeDatasetId) {
        await updateDatasetMeta(activeDatasetId, { name: name.trim(), description, emoji: cover, isPublic })
        await updateDatasetRows(activeDatasetId, grid)
      } else {
        const id = await saveDataset(user, name.trim(), description, cover, isPublic, grid)
        setActiveDatasetId(id)
      }
      markClean()
      showToast('Saved to your library')
      onClose()
    } catch {
      showToast('Save failed. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Save Dataset">
        <div className="space-y-4">

          {/* Cover preview — semi-transparent with click-to-change overlay */}
          <div className="relative" style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPickerOpen(v => !v)}
              className="relative w-full overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <DatasetCoverThumb cover={cover} size="lg" className="opacity-60 w-full" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className="text-2xl">🖼️</span>
                <span className="text-sm font-medium text-white drop-shadow">Click to choose image</span>
              </div>
            </button>
            <CoverPicker
              open={pickerOpen}
              value={cover}
              onChange={setCover}
              onClose={() => setPickerOpen(false)}
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 80))}
              placeholder="My dataset"
              maxLength={80}
              className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 200))}
              placeholder="Optional description…"
              rows={2}
              maxLength={200}
              className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <p className="text-xs text-[var(--color-muted)] text-right">{description.length}/200</p>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium mb-2">Visibility</label>
            <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${!isPublic ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}
              >
                🔒 Private
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${isPublic ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}
              >
                🌐 Public
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
