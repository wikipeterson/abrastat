'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Workspace', href: '/workspace' },
  { label: 'Library', href: '/workspace?mode=library&section=all' },
  { label: 'Applets', href: '/workspace?mode=library&section=applets' },
  { label: 'Games', href: '/workspace?mode=library&section=games' },
]

const SCREENSHOTS = ['/landing/screenshot-1.png', '/landing/screenshot-2.png', '/landing/screenshot-3.png']

export function LandingPage() {
  const { user, loading, isGuest, continueAsGuest } = useAuth()
  const router = useRouter()
  const [showSignIn, setShowSignIn] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/workspace')
  }, [user, loading, isGuest, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-3">
        {/* Nav */}
        <nav className="flex items-center justify-between gap-4 flex-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="AbraStat" className="h-7 w-auto" />
          <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 flex-wrap">
            {NAV_LINKS.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  link.label === 'Home'
                    ? 'bg-[var(--color-text)] text-white'
                    : 'text-[var(--color-accent-strong)] hover:bg-[var(--color-bg)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <button
            onClick={() => setShowSignIn(true)}
            className="px-4 py-2 rounded-full bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-110 transition-all"
          >
            Sign in
          </button>
        </nav>

        {/* Coming-soon Teacher badge */}
        <div className="flex justify-end">
          <Link
            href="/teacher"
            className="font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--color-gold-text)] bg-[var(--color-gold-light)] px-3 py-1.5 rounded-full hover:brightness-95 transition-all"
          >
            ★ Coming soon: AbraStat Teacher →
          </Link>
        </div>

        {/* Hero */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center shadow-[0_1px_2px_rgba(8,38,33,0.05),0_20px_44px_-28px_rgba(8,38,33,0.30)]">
          <div>
            <h1 className="font-sans font-semibold text-[36px] sm:text-[48px] leading-[1.05] tracking-tight text-[var(--color-text)]">
              Every probability
              <br />
              and statistics tool
              <br />
              <span className="font-serif italic font-medium text-[var(--color-accent-strong)]">your class needs.</span>
            </h1>
            <p className="text-[15.5px] leading-relaxed text-[var(--color-muted)] max-w-md mt-5 mb-6">
              A real spreadsheet. Ten chart types. Coin flippers, dice, spinners and a Galton board
              for live demos. Games for guessing correlations and residuals. Save &amp; share datasets
              so the whole class can riff on the same numbers.
            </p>

            {showSignIn ? (
              <SignInButton />
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => setShowSignIn(true)}
                  className="px-5 py-3 rounded-xl bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-110 transition-all"
                >
                  Get started — it&apos;s free
                </button>
                <button
                  onClick={() => continueAsGuest()}
                  className="text-sm font-semibold text-[var(--color-text)] underline underline-offset-2 hover:text-[var(--color-accent-strong)] transition-colors"
                >
                  Continue as guest →
                </button>
              </div>
            )}
          </div>
          <ScreenshotCycle />
        </div>

        {/* Demo video */}
        <div className="rounded-3xl overflow-hidden">
          <video
            src="/landing/demo.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full block"
          />
        </div>
      </div>
    </main>
  )
}

function ScreenshotCycle() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % SCREENSHOTS.length), 3200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)]">
      {SCREENSHOTS.map((src, idx) => (
        <div key={src} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === i ? 1 : 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="AbraStat product screenshot" className="w-full h-full object-contain" />
        </div>
      ))}
      <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
        {SCREENSHOTS.map((_, idx) => (
          <div
            key={idx}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: idx === i ? 'var(--color-text)' : 'rgba(14,61,56,0.25)' }}
          />
        ))}
      </div>
    </div>
  )
}
