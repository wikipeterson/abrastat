import { BUILD_COMMIT, BUILD_STAMP_ISO } from '@/lib/buildStamp.generated'

const formatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function BuildStamp() {
  const builtAt = formatter.format(new Date(BUILD_STAMP_ISO))

  return (
    <div className="fixed left-3 bottom-3 z-50 pointer-events-none">
      <div className="rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
        Build {builtAt} · {BUILD_COMMIT}
      </div>
    </div>
  )
}

