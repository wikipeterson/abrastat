'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function FloatingTooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)

  function show() {
    if (!triggerRef.current || !content) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    setVisible(true)
  }
  function hide() { setVisible(false) }

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </span>
      {visible && pos && content && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)', zIndex: 9999, pointerEvents: 'none' }}
          className="max-w-[300px] rounded-xl bg-[var(--color-text)] px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
        >
          {content}
          <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-text)' }} />
        </div>,
        document.body
      )}
    </>
  )
}
