'use client'

// A scannable QR code for a poll's share link, shown as a popup from "Your polls." Reuses the
// same `qrcode` package (client-side canvas render) RedPen's SheetPrintView.tsx already uses for
// printed sheets, rather than a third-party image-generation service — one QR dependency, and
// nothing here ever leaves the browser.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Poll } from '@/lib/polls/types'

interface QrCodeModalProps {
  poll: Poll
  onClose: () => void
}

/** Same link `copyLink` builds in PollsBrowse — for a class poll the code is baked into the
 *  path, so scanning it skips the class-code entry screen entirely. */
export function pollShareLink(poll: Poll): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/p/${poll.mode === 'class' ? poll.classCode : poll.id}`
}

export function QrCodeModal({ poll, onClose }: QrCodeModalProps) {
  const link = pollShareLink(poll)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center gap-4 text-center">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded hover:bg-[var(--color-bg)] transition-colors">
          <X size={18} />
        </button>
        <div className="font-serif italic text-lg font-semibold text-[var(--color-text)] pr-6">{poll.title}</div>
        <PollQrCanvas value={link} size={220} />
        <div className="font-mono text-xs text-[var(--color-muted)] break-all">{link}</div>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Scan to open this poll directly
          {poll.mode === 'class' && ' — class code is baked in, no typing needed.'}
        </p>
      </div>
    </div>
  )
}

function PollQrCanvas({ value, size }: { value: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then(QRCode => {
        if (cancelled || !canvasRef.current) return
        return QRCode.toCanvas(canvasRef.current, value, { margin: 1, width: size, errorCorrectionLevel: 'M' })
      })
      .then(() => {
        if (cancelled || !canvasRef.current) return
        // qrcode's canvas renderer sets canvas.style.width/height to match the pixel buffer
        // after drawing — reassert the intended display size every time (same gotcha as
        // SheetPrintView.tsx's SheetQr).
        canvasRef.current.style.width = `${size}px`
        canvasRef.current.style.height = `${size}px`
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [value, size])

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-center break-all p-3 border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-muted)]"
      >
        Couldn&apos;t generate a QR code — use the link below instead.
      </div>
    )
  }
  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg" />
}
