'use client'

import { BUILD_COMMIT, BUILD_STAMP_ISO } from '@/lib/buildStamp.generated'
import { useAuth } from '@/components/auth/AuthProvider'

const BUILD_STAMP_ALLOWED_EMAILS = new Set([
  'peterson.steve@gmail.com',
])

const formatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function BuildStamp() {
  const { user, loading, isGuest } = useAuth()
  const builtAt = formatter.format(new Date(BUILD_STAMP_ISO))
  const deployedCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    BUILD_COMMIT

  const email = user?.email?.toLowerCase() ?? null
  const canSeeBuildStamp = !loading && !isGuest && !!email && BUILD_STAMP_ALLOWED_EMAILS.has(email)

  if (!canSeeBuildStamp) return null

  return (
    <div
      className="hidden sm:block"
      title="Deployment build stamp"
    >
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] shadow-sm whitespace-nowrap">
        Build {builtAt} · {deployedCommit}
      </div>
    </div>
  )
}
