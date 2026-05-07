import { User } from 'firebase/auth'

const PUZZLE_WEEK_PREVIEW_UIDS = new Set([
  'dev-user',
])

const PUZZLE_WEEK_PREVIEW_EMAILS = new Set([
  'peterson.steve@gmail.com',
])

const PUZZLE_WEEK_PREVIEW_EMAIL_FRAGMENTS = [
  'speterson',
]

const PUZZLE_WEEK_PREVIEW_DISPLAY_NAMES = [
  'chris walter',
]

export function canAccessPuzzleWeek(user: User | null | undefined): boolean {
  if (!user) return false
  if (PUZZLE_WEEK_PREVIEW_UIDS.has(user.uid)) return true

  const email = user.email?.toLowerCase().trim()
  const displayName = user.displayName?.toLowerCase().trim()

  if (displayName && PUZZLE_WEEK_PREVIEW_DISPLAY_NAMES.includes(displayName)) {
    return true
  }

  if (!email) return false

  if (PUZZLE_WEEK_PREVIEW_EMAILS.has(email)) return true

  return PUZZLE_WEEK_PREVIEW_EMAIL_FRAGMENTS.some(fragment => email.includes(fragment))
}
