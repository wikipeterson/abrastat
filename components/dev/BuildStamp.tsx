import { BUILD_COMMIT, BUILD_STAMP_ISO } from '@/lib/buildStamp.generated'

const formatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function BuildStamp() {
  const builtAt = formatter.format(new Date(BUILD_STAMP_ISO))
  const deployedCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    BUILD_COMMIT

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
