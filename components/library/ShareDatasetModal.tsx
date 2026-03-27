'use client'

import { useState, useEffect } from 'react'
import { Link2, Globe, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useToast, Toast } from '@/components/ui/Toast'
import { updateDatasetMeta } from '@/lib/firestore'

interface ShareDatasetModalProps {
  open: boolean
  onClose: () => void
  datasetId: string
  initialIsPublic: boolean
}

export function ShareDatasetModal({ open, onClose, datasetId, initialIsPublic }: ShareDatasetModalProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)
  const { toast, show: showToast, hide: hideToast } = useToast()

  useEffect(() => {
    if (open) setIsPublic(initialIsPublic)
  }, [open, initialIsPublic])

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/d/${datasetId}`
    : `/d/${datasetId}`

  async function handleTogglePublic(newValue: boolean) {
    setToggling(true)
    try {
      await updateDatasetMeta(datasetId, { isPublic: newValue })
      setIsPublic(newValue)
    } catch {
      showToast('Could not update visibility. Please try again.', 'error')
    } finally {
      setToggling(false)
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      showToast('Link copied!')
    }).catch(() => {
      window.prompt('Copy this link:', shareUrl)
    })
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share Dataset">
        <div className="space-y-4">
          {/* Visibility toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Visibility</label>
            <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
              <button
                type="button"
                disabled={toggling}
                onClick={() => handleTogglePublic(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${!isPublic ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}
              >
                <Lock size={13} /> Private
              </button>
              <button
                type="button"
                disabled={toggling}
                onClick={() => handleTogglePublic(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${isPublic ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'}`}
              >
                <Globe size={13} /> Public
              </button>
            </div>
          </div>

          {/* Share link */}
          <div>
            <label className="block text-sm font-medium mb-2">Shareable link</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] bg-slate-50 focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Link2 size={14} /> Copy
              </button>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-1.5">
              Anyone with this link can open their own copy of the dataset.
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:bg-slate-100"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
