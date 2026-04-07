'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/AuthProvider'
import { SignInButton } from '@/components/auth/SignInButton'

export default function LandingPage() {
  const { user, loading, isGuest, continueAsGuest } = useAuth()
  const router = useRouter()

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
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(200px, 60vw, 360px)', height: 'auto' }} className="mb-4" />
        <p className="text-2xl sm:text-3xl font-semibold text-[var(--color-text)] mb-3">
          Statistics made for students.
        </p>
        <p className="text-[var(--color-muted)] max-w-md mb-10">
          Enter or upload data, run summary stats, build beautiful interactive charts, and save datasets to share with your class.
        </p>
        <div className="flex flex-col items-center gap-3">
          <SignInButton />
          <button
            onClick={() => continueAsGuest()}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] underline underline-offset-2 transition-colors"
          >
            Continue as guest
          </button>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-t border-[var(--color-border)] bg-white py-10">
        <div className="max-w-3xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { icon: '✏️', title: 'Edit data like a spreadsheet', desc: 'Type, paste, or import CSV and Excel files into a clean editable grid.' },
            { icon: '📊', title: 'Beautiful interactive charts', desc: 'Histograms, box plots, scatter plots, and more — all interactive and downloadable.' },
            { icon: '🌐', title: 'Save & share datasets', desc: 'Save your work to a library and share public datasets with classmates.' },
          ].map(f => (
            <div key={f.title}>
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[var(--color-text)] mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--color-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 px-4">
        <h2 className="font-display italic text-2xl font-bold text-center text-[var(--color-text)] mb-8">How it works</h2>
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { step: '1', label: 'Import', desc: 'Paste, upload, or link a Google Sheet' },
            { step: '2', label: 'Edit', desc: 'Clean and label your data' },
            { step: '3', label: 'Analyze', desc: 'Run stats and build charts' },
            { step: '4', label: 'Save', desc: 'Keep it private or share with the class' },
          ].map(s => (
            <div key={s.step} className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] text-white font-bold flex items-center justify-center mb-2">{s.step}</div>
              <p className="font-semibold text-[var(--color-text)] text-sm">{s.label}</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
