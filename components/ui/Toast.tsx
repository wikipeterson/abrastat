'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error'
export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastProps {
  message: string
  type?: ToastType
  onClose: () => void
  action?: ToastAction
}

export function Toast({ message, type = 'success', onClose, action }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${type === 'success' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-danger)]'}`}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
      {action && (
        <button onClick={action.onClick} className="underline underline-offset-2 whitespace-nowrap">
          {action.label}
        </button>
      )}
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: ToastType; action?: ToastAction } | null>(null)
  const show = (message: string, type: ToastType = 'success', action?: ToastAction) => setToast({ message, type, action })
  const hide = () => setToast(null)
  return { toast, show, hide }
}
