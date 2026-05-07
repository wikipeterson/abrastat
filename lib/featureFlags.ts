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

export function canAccessPuzzleWeek(user: User | null | undefined): boolean {
  if (!user) return false
  if (PUZZLE_WEEK_PREVIEW_UIDS.has(user.uid)) return true

  const email = user.email?.toLowerCase().trim()
  if (!email) return false

  if (PUZZLE_WEEK_PREVIEW_EMAILS.has(email)) return true

  return PUZZLE_WEEK_PREVIEW_EMAIL_FRAGMENTS.some(fragment => email.includes(fragment))
}
