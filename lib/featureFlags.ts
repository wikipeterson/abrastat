import { User } from 'firebase/auth'

export interface PuzzleWeekIdentityLike {
  uid?: string | null
  email?: string | null
  displayName?: string | null
}

const PUZZLE_WEEK_PREVIEW_UIDS = new Set([
  'dev-user',
])

const PUZZLE_WEEK_PREVIEW_EMAILS = new Set([
  'peterson.steve@gmail.com',
  'cwalter@haverfordsd.net',
])

const PUZZLE_WEEK_PREVIEW_EMAIL_FRAGMENTS = [
  'speterson',
]

const PUZZLE_WEEK_PREVIEW_DISPLAY_NAMES = [
  'chris walter',
]

export const PUZZLE_WEEK_ALLOWED_EMAIL_DOMAIN = '@haverfordsd.net'
export const PUZZLE_WEEK_PACKET_RELEASE_AT = new Date('2026-05-18T00:00:00-04:00')

export function isPuzzleWeekPreviewIdentity(identity: PuzzleWeekIdentityLike | null | undefined): boolean {
  if (!identity) return false
  if (identity.uid && PUZZLE_WEEK_PREVIEW_UIDS.has(identity.uid)) return true

  const email = identity.email?.toLowerCase().trim()
  const displayName = identity.displayName?.toLowerCase().trim()

  if (displayName && PUZZLE_WEEK_PREVIEW_DISPLAY_NAMES.includes(displayName)) {
    return true
  }

  if (!email) return false

  if (PUZZLE_WEEK_PREVIEW_EMAILS.has(email)) return true

  return PUZZLE_WEEK_PREVIEW_EMAIL_FRAGMENTS.some(fragment => email.includes(fragment))
}

export function canResetPuzzleWeekRegistrationIdentity(identity: PuzzleWeekIdentityLike | null | undefined): boolean {
  return isPuzzleWeekPreviewIdentity(identity)
}

export function canManagePuzzleWeekIdentity(identity: PuzzleWeekIdentityLike | null | undefined): boolean {
  return isPuzzleWeekPreviewIdentity(identity)
}

function isPuzzleWeekPreviewUser(user: User | null | undefined): boolean {
  return isPuzzleWeekPreviewIdentity(user)
}

export function canAccessPuzzleWeek(_user: User | null | undefined): boolean {
  return true
}

export function canRegisterForPuzzleWeek(user: User | null | undefined): boolean {
  return canRegisterForPuzzleWeekIdentity(user)
}

export function canRegisterForPuzzleWeekIdentity(identity: PuzzleWeekIdentityLike | null | undefined): boolean {
  if (!identity) return false
  if (isPuzzleWeekPreviewIdentity(identity)) return true

  const email = identity.email?.toLowerCase().trim()
  return Boolean(email && email.endsWith(PUZZLE_WEEK_ALLOWED_EMAIL_DOMAIN))
}

export function isPuzzleWeekPacketReleased(now = new Date()) {
  return now >= PUZZLE_WEEK_PACKET_RELEASE_AT
}

export function canDownloadPuzzleWeekPacketIdentity(
  identity: PuzzleWeekIdentityLike | null | undefined,
  now = new Date(),
): boolean {
  if (!canRegisterForPuzzleWeekIdentity(identity)) return false
  if (isPuzzleWeekPreviewIdentity(identity)) return true
  return isPuzzleWeekPacketReleased(now)
}

export function getPuzzleWeekPacketMessage(
  identity: PuzzleWeekIdentityLike | null | undefined,
  now = new Date(),
) {
  if (!canRegisterForPuzzleWeekIdentity(identity)) {
    return getPuzzleWeekEligibilityMessage()
  }
  if (canDownloadPuzzleWeekPacketIdentity(identity, now)) return null
  return 'The puzzle pack will be available on May 18, 2026.'
}

export function getPuzzleWeekEligibilityMessage() {
  return 'Puzzle Week registration is currently limited to @haverfordsd.net accounts.'
}
