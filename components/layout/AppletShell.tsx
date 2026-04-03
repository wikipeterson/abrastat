'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { Header } from '@/components/layout/Header'

const SIDEBAR_WIDTH_CLASS = 'md:w-48'

const LIBRARY_LINKS = [
  { href: '/workspace?mode=library&section=all', label: 'Public Datasets' },
  { href: '/workspace?mode=library&section=mine', label: 'My Datasets' },
  { href: '/workspace?mode=library&section=games', label: 'Games' },
  { href: '/workspace?mode=library&section=applets', label: 'Applets' },
  { href: '/workspace?mode=library&section=polls', label: 'Polls', soon: true },
]

const APPLET_LINKS = [
  { href: '/applets/dice-roller', label: 'Dice Roller' },
  { href: '/applets/galton-board', label: 'Galton Board' },
  { href: '/applets/spinner', label: 'Spinner' },
]

export function AppletShell({
  title,
  activeApplet,
  children,
}: {
  title: string
  activeApplet: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Header centerTitle={title} />

      <div className="flex flex-1 min-h-0">
        <aside
          className={`flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col ${SIDEBAR_WIDTH_CLASS}`}
        >
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Library</div>
          </div>

          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {LIBRARY_LINKS.map(item =>
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
          <div className="max-w-6xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
