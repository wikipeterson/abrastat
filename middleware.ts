import { NextRequest, NextResponse } from 'next/server'

function isPuzzleWeekHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false
  const host = hostHeader.toLowerCase().split(':')[0]
  return host === 'puzzleweek.abrastat.com' || host === 'puzzleweek.localhost'
}

export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|logo.svg|sounds/).*)'],
}
