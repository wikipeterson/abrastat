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

const PUZZLE_WEEK_ALLOWED_EMAIL_DOMAIN = '@haverfordsd.net'

function isPuzzleWeekPreviewUser(user: User | null | undefined): boolean {
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

export function canAccessPuzzleWeek(user: User | null | undefined): boolean {
  return isPuzzleWeekPreviewUser(user)
}

export function canRegisterForPuzzleWeek(user: User | null | undefined): boolean {
  if (!user) return false
  if (isPuzzleWeekPreviewUser(user)) return true

  const email = user.email?.toLowerCase().trim()
  return Boolean(email && email.endsWith(PUZZLE_WEEK_ALLOWED_EMAIL_DOMAIN))
}

export function getPuzzleWeekEligibilityMessage() {
  return 'Puzzle Week registration is currently limited to @haverfordsd.net accounts.'
}
