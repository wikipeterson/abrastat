'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'

const SCREENSHOTS = ['/landing/screenshot-1.png', '/landing/screenshot-2.png', '/landing/screenshot-3.png']

export function LandingPage() {
  const { user, loading, isGuest, continueAsGuest } = useAuth()
  const router = useRouter()
  const [authIntent, setAuthIntent] = useState<'signin' | 'signup' | null>(null)

  useEffect(() => {
    // A guest is a real signed-in user but not a durable one — don't bounce them away from the
    // one place they can create a real account (the sign-in form below). Only a fully
    // authenticated user skips straight to the workspace.
    if (!loading && user && !isGuest) router.replace('/workspace')
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
        <nav className="flex items-center justify-center py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="AbraStat" className="h-20 sm:h-24 w-auto" />
        </nav>

        {/* Hero */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 items-center shadow-[0_1px_2px_rgba(8,38,33,0.05),0_20px_44px_-28px_rgba(8,38,33,0.30)]">
          <div>
            <h1 className="font-sans font-semibold text-[28px] sm:text-[36px] leading-[1.08] tracking-tight text-[var(--color-text)]">
              Every probability
              <br />
              and statistics tool
              <br />
              <span className="font-serif italic font-medium text-[var(--color-accent-strong)]">your class needs.</span>
            </h1>
            <p className="text-sm leading-relaxed text-[var(--color-muted)] max-w-sm mt-4 mb-6">
              A real spreadsheet. Ten chart types. Coin flippers, dice, spinners and a Galton board
              for live demos. Games for guessing correlations and residuals. Save &amp; share datasets
              so the whole class can riff on the same numbers.
            </p>

            {authIntent ? (
              <p className="text-sm text-[var(--color-muted)]">
                Create a free account to access AbraStat — or{' '}
                <button
                  onClick={() => continueAsGuest()}
                  className="font-semibold text-[var(--color-text)] underline underline-offset-2 hover:text-[var(--color-accent-strong)] transition-colors"
                >
                  continue as guest
                </button>
                .
              </p>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => setAuthIntent('signup')}
                  className="px-5 py-3 rounded-xl bg-[var(--color-text)] text-white text-sm font-semibold hover:brightness-110 transition-all"
                >
                  Get started — it&apos;s free
                </button>
                <button
                  onClick={() => setAuthIntent('signin')}
                  className="px-5 py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
                >
                  Sign in
                </button>
              </div>
            )}

            {!authIntent && (
              <Link
                href="/teacher"
                className="inline-block mt-5 font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--color-gold-text)] bg-[var(--color-gold-light)] px-3 py-1.5 rounded-full hover:brightness-95 transition-all"
              >
                ★ Coming soon: AbraStat Teacher →
              </Link>
            )}
          </div>

          {authIntent ? (
            <SignInButton initialMode={authIntent} />
          ) : (
            <div className="rounded-2xl overflow-hidden border border-[var(--color-border)]">
              <video
                src="/landing/demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full aspect-video object-cover block"
              />
            </div>
          )}
        </div>

        {/* Screenshots */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCREENSHOTS.map(src => (
            <div key={src} className="rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="AbraStat product screenshot" className="w-full h-auto block" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
