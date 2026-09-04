'use client'

import { useMemo, useState } from 'react'
import {
  resetPasswordForEmail,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
} from '@/lib/auth'

type AuthMode = 'signin' | 'signup'

interface SignInButtonProps {
  googleOnly?: boolean
  initialMode?: AuthMode
}

function formatAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is invalid.'
    case 'auth/missing-password':
      return 'Enter a password.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/email-already-in-use':
      return 'That email is already in use.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a bit.'
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase yet.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

export function SignInButton({ googleOnly = false, initialMode = 'signin' }: SignInButtonProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0, [email, password])

  async function handleEmailAuth() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'signin') {
        await signInWithEmailPassword(email.trim(), password)
      } else {
        await signUpWithEmailPassword(email.trim(), password)
      }
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    setMessage(null)
    try {
      await signInWithGoogle()
    } catch {
      setError('Google sign-in failed. Please try again.')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then click reset.')
      setMessage(null)
      return
    }
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await resetPasswordForEmail(email.trim())
      setMessage('Password reset email sent.')
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white/90 p-4 shadow-sm">
      {!googleOnly && (
        <>
          <div className="mb-4 flex rounded-xl border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => {
                setMode('signin')
                setError(null)
                setMessage(null)
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setError(null)
                setMessage(null)
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-bg)]'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />

            <button
              onClick={handleEmailAuth}
              disabled={!canSubmit || submitting || googleLoading}
              className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Working…' : mode === 'signin' ? 'Sign In with Email' : 'Create Account'}
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
          </div>
        </>
      )}
      <div className={googleOnly ? 'space-y-3' : 'mt-3 space-y-3'}>
        <button
          onClick={handleGoogleSignIn}
          disabled={submitting || googleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? (
            <span className="h-5 w-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Sign in with Google
        </button>

        {!googleOnly && mode === 'signin' && (
          <button
            onClick={handleResetPassword}
            disabled={submitting || googleLoading}
            className="text-sm text-[var(--color-muted)] underline underline-offset-2 transition-colors hover:text-[var(--color-text)]"
          >
            Forgot password?
          </button>
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {message && <p className="text-sm text-[var(--color-accent)]">{message}</p>}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
