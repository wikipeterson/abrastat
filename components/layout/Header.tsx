'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Save, Library, LogOut, ChevronDown, FilePlus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { signOut } from '@/lib/auth'
import { useAuth } from '@/components/auth/AuthProvider'
import { SaveDatasetModal } from '@/components/library/SaveDatasetModal'

interface HeaderProps {
  onNew?: () => void
}

export function Header({ onNew }: HeaderProps) {
  const { user } = useAuth()
  const { isDirty, clearGrid } = useStore()
  const [showSave, setShowSave] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    clearGrid()
    router.push('/')
  }

  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-white flex-shrink-0">
        <Link href="/library" className="font-display italic text-4xl font-bold text-[var(--color-accent)]">
          AbraStat
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setShowSave(true)}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDirty ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)]'}`}
            aria-label="Save dataset"
          >
            <Save size={14} />
            <span className="hidden sm:inline">Save{isDirty ? ' ●' : ''}</span>
            {isDirty && <span className="sm:hidden">●</span>}
          </button>

          {onNew && (
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors"
              aria-label="New dataset"
            >
              <FilePlus size={14} />
              <span className="hidden sm:inline">New</span>
            </button>
          )}

          <Link href="/library" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors">
            <Library size={14} />
            <span className="hidden sm:inline">Library</span>
          </Link>

          {user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="User menu"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-white text-xs flex items-center justify-center font-bold">
                    {user.displayName?.[0] ?? '?'}
                  </div>
                )}
                <ChevronDown size={12} className="text-[var(--color-muted)] hidden sm:block" />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-[var(--color-border)] py-1 z-50">
                  <div className="px-3 py-2 text-xs text-[var(--color-muted)] border-b border-[var(--color-border)] truncate">
                    {user.displayName}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-slate-50"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <SaveDatasetModal open={showSave} onClose={() => setShowSave(false)} />
    </>
  )
}
