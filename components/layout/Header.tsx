'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ReactNode, useState } from 'react'
import { Save, Library, LogOut, ChevronDown, FilePlus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { signOut } from '@/lib/auth'
import { useAuth } from '@/components/auth/AuthProvider'

interface HeaderProps {
  onNew?: () => void
  onSave?: () => void
  activeTab?: 'data' | 'lab'
  onTabChange?: (tab: 'data' | 'lab') => void
  onToggleSidebar?: () => void
  datasetName?: string
  labActions?: ReactNode
}

export function Header({
  onNew,
  onSave,
  activeTab,
  onTabChange,
  onToggleSidebar,
  datasetName,
  labActions,
}: HeaderProps) {
  const { user, isGuest } = useAuth()
  const { isDirty, clearGrid } = useStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const router = useRouter()
  const showWorkspaceTabs = !!activeTab && !!onTabChange

  async function handleSignOut() {
    await signOut()
    clearGrid()
    router.push('/')
  }

  return (
    <>
      <header className="h-[4.5rem] flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-white flex-shrink-0 gap-4">
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
          <Link href="/home" className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: 248, height: 'auto' }} />
          </Link>

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

          {showWorkspaceTabs && (
            <div className="hidden sm:flex items-center self-stretch">
              {([
                { id: 'data', label: 'Data' },
                { id: 'lab', label: 'Lab' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {activeTab === 'lab' && labActions}

          {!isGuest && activeTab !== 'lab' && (
            <>
              <button
                onClick={onSave}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDirty ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)]'}`}
                aria-label="Save dataset"
              >
                <Save size={14} />
                <span className="hidden sm:inline">Save{isDirty ? ' ●' : ''}</span>
                {isDirty && <span className="sm:hidden">●</span>}
              </button>
            </>
          )}

          {onNew && activeTab !== 'lab' && (
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors"
              aria-label="New dataset"
            >
              <FilePlus size={14} />
              <span className="hidden sm:inline">New</span>
            </button>
          )}

          {showWorkspaceTabs && (
            <div className="flex sm:hidden items-center rounded-xl bg-slate-100 p-1 mr-1">
              {([
                { id: 'data', label: 'Data' },
                { id: 'lab', label: 'Lab' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-[var(--color-accent)] shadow-sm'
                      : 'text-[var(--color-muted)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {!isGuest && (
            <Link href="/home" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 transition-colors">
              <Library size={14} />
              <span className="hidden sm:inline">Home</span>
            </Link>
          )}

          {user && (
            <div className="relative">
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
