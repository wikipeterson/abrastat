import { NextRequest, NextResponse } from 'next/server'

function isPuzzleWeekHost(host: string): boolean {
  return host === 'puzzleweek.abrastat.com' || host === 'puzzleweek.localhost'
}

export function middleware(request: NextRequest) {
  const host = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    ''
  ).toLowerCase().split(':')[0]

  if (isPuzzleWeekHost(host) && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/puzzleweek'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|sounds/).*)'],
}
