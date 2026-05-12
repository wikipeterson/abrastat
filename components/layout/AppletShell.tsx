'use client'

import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/components/auth/AuthProvider'
import { canAccessPuzzleWeek } from '@/lib/featureFlags'

const SIDEBAR_WIDTH_CLASS = 'md:w-48'

const BASE_LIBRARY_LINKS = [
  { href: '/workspace?mode=library&section=all', label: 'Public Datasets' },
  { href: '/workspace?mode=library&section=mine', label: 'My Datasets' },
  { href: '/workspace?mode=library&section=games', label: 'Games' },
  { href: '/workspace?mode=library&section=applets', label: 'Applets' },
  { href: '/workspace?mode=library&section=polls', label: 'Polls', soon: true },
]

const PUZZLE_WEEK_URL = 'https://puzzleweek.abrastat.com'
const LOGIC_PUZZLES_URL = 'https://puzzleweek.abrastat.com/puzzleweek/bonus'

const APPLET_LINKS = [
  { href: '/applets/dice-roller', label: 'Dice Roller' },
  { href: '/applets/coin-flipper', label: 'Coin Flipper' },
  { href: '/applets/random-number-generator', label: 'Random Number Generator' },
  { href: '/applets/spinner', label: 'Spinner' },
  { href: '/applets/galton-board', label: 'Galton Board' },
]

export function AppletShell({
  title,
  activeApplet,
  contentClassName,
  children,
}: {
  title: string
  activeApplet: string
  contentClassName?: string
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const libraryLinks = canAccessPuzzleWeek(user)
    ? [...BASE_LIBRARY_LINKS, { href: PUZZLE_WEEK_URL, label: 'Puzzle Week' }, { href: LOGIC_PUZZLES_URL, label: 'Logic Puzzles' }]
    : BASE_LIBRARY_LINKS

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Header centerTitle={title} onToggleSidebar={() => setSidebarOpen(v => !v)} />

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`
          flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col
          md:relative ${SIDEBAR_WIDTH_CLASS} md:translate-x-0 md:z-auto
          fixed inset-y-0 left-0 z-30 w-56 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Library</div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-[var(--color-muted)] text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {libraryLinks.map(item =>
              item.soon ? (
                <div
                  key={item.label}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-border)] cursor-default"
                >
                  <span>{item.label}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide">Soon</span>
                </div>
              ) : item.label === 'Applets' ? (
                <div key={item.label} className="space-y-1">
                  <Link
                    href={item.href}
                    className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-white"
                  >
                    {item.label}
                  </Link>
                  <div className="pl-2 space-y-1">
                    {APPLET_LINKS.map(applet => {
                      const active = applet.label === activeApplet
                      return (
                        <Link
                          key={applet.href}
                          href={applet.href}
                          className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            active
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : 'text-[var(--color-text)] hover:bg-slate-100'
                          }`}
                        >
                          {applet.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text)] hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className={`mx-auto px-4 py-6 ${contentClassName ?? 'max-w-6xl'}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
