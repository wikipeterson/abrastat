'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Save, Library, LogOut, ChevronDown, FilePlus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { signOut } from '@/lib/auth'
import { useAuth } from '@/components/auth/AuthProvider'

interface HeaderProps {
  onNew?: () => void
  onSave?: () => void
  onToggleSidebar?: () => void
  datasetName?: string
  centerTitle?: string | null
  labActions?: ReactNode
  leadingNav?: ReactNode
  modeTabs?: { id: string; label: string }[]
  activeModeId?: string
  onModeChange?: (id: string) => void
  showSave?: boolean
  showHomeLink?: boolean
}

export function Header({
  onNew,
  onSave,
  onToggleSidebar,
  datasetName,
  centerTitle,
  labActions,
  leadingNav,
  modeTabs,
  activeModeId,
  onModeChange,
  showSave = true,
  showHomeLink = true,
}: HeaderProps) {
  const { user, isGuest } = useAuth()
  const { isDirty, clearGrid } = useStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!showUserMenu) return

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showUserMenu])

  async function handleSignOut() {
    await signOut()
    clearGrid()
    router.push('/')
  }

  return (
    <>
      <header className="relative h-[4.5rem] flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-white flex-shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden text-[var(--color-muted)] hover:text-[var(--color-text)] text-xl leading-none"
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
          )}
          <div className="flex-shrink-0 select-none" aria-label="AbraStat logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: 300, height: 'auto' }} />
          </div>

          {(leadingNav || modeTabs?.length) && (
            <div className="hidden md:flex items-center gap-2">
              {leadingNav}
              {modeTabs && modeTabs.length > 0 && (
                <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-white p-1">
                  {modeTabs.map(tab => {
                    const active = tab.id === activeModeId
                    return (
                      <button
                        key={tab.id}
                        onClick={() => onModeChange?.(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-[var(--color-accent)] text-white'
                            : 'text-[var(--color-muted)] hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {datasetName && (
            <div className="hidden md:flex min-w-0 max-w-[380px] flex-col justify-center px-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] font-semibold">
                Dataset
              </span>
              <span className="text-base font-semibold text-[var(--color-text)] truncate">
                {datasetName}
              </span>
            </div>
          )}
        </div>

        {centerTitle && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
            <div className="max-w-[40vw] truncate px-4 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
              {centerTitle}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-2">
          {labActions}

          {!isGuest && showSave && (
            <>
              <button
                onClick={onSave}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isDirty
                    ? 'text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]'
                    : 'text-[var(--color-muted)] hover:bg-slate-100'
                }`}
                aria-label="Save dataset"
              >
                <Save size={14} />
                <span className="hidden sm:inline">Save Data</span>
              </button>
            </>
          )}

          {onNew && (
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors"
              aria-label="New dataset"
            >
              <FilePlus size={14} />
              <span className="hidden sm:inline">New Data</span>
            </button>
          )}

          {!isGuest && showHomeLink && (
            <Link href="/home" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors">
              <Library size={14} />
              <span className="hidden sm:inline">Home</span>
            </Link>
          )}

          {user && (
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="User menu"
              >
                {user.photoURL && !isGuest ? (
                  <Image src={user.photoURL} alt="" width={24} height={24} className="rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold ${isGuest ? 'bg-slate-400' : 'bg-[var(--color-accent)]'}`}>
                    {isGuest ? '?' : (user.displayName?.[0] ?? '?')}
                  </div>
                )}
                <ChevronDown size={12} className="text-[var(--color-muted)] hidden sm:block" />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-[var(--color-border)] py-1 z-50">
                  <div className="px-3 py-2 text-xs text-[var(--color-muted)] border-b border-[var(--color-border)] truncate">
                    {isGuest ? 'Guest — changes not saved' : user.displayName}
                  </div>
                  {isGuest ? (
                    <Link
                      href="/"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-accent)] font-medium hover:bg-slate-50"
                      onClick={() => setShowUserMenu(false)}
                    >
                      Sign in to save your work
                    </Link>
                  ) : (
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-slate-50"
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>
    </>
  )
}
