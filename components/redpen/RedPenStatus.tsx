'use client'

// Shared loading/error states for every RedPen screen now that storage.ts is Firestore-backed
// (async) instead of localStorage (sync) — every screen that used to read data directly in its
// render body now fetches on mount and needs somewhere to put "still loading" and "that failed."

export function RedPenLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
    </div>
  )
}

export function RedPenError({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-4">
        {message}
      </div>
    </div>
  )
}
