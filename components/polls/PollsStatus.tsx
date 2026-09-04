'use client'

// Shared loading/error states for every Polls screen — same pattern as RedPen's
// components/redpen/RedPenStatus.tsx, since every screen here fetches from Firestore on mount.

export function PollsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
    </div>
  )
}

export function PollsError({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-lg p-4">
        {message}
      </div>
    </div>
  )
}
