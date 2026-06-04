'use client'

import { usePathname } from 'next/navigation'
import { BUILD_COMMIT, BUILD_STAMP_ISO } from '@/lib/buildStamp.generated'
import { useAuth } from '@/components/auth/AuthProvider'

const BUILD_STAMP_ALLOWED_EMAILS = new Set([
  'speterson@haverfordsd.net',
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
  const pathname = usePathname()
  const builtAt = formatter.format(new Date(BUILD_STAMP_ISO))
  const deployedCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    BUILD_COMMIT

  const email = user?.email?.toLowerCase() ?? null
  const canSeeBuildStamp = !loading && !isGuest && !!email && BUILD_STAMP_ALLOWED_EMAILS.has(email)

  if (!canSeeBuildStamp) return null
  if (pathname?.includes('/workspace')) return null

  return (
    <div
      className="fixed left-3 bottom-3 z-50 pointer-events-none hidden sm:block"
      title="Deployment build stamp"
    >
      <div className="rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
        Build {builtAt} · {deployedCommit}
      </div>
    </div>
  )
}
