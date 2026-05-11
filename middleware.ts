import { NextRequest, NextResponse } from 'next/server'

// Subdomain routing for puzzleweek.abrastat.com is handled in app/page.tsx
// via x-forwarded-host detection (force-dynamic). Do NOT add URL rewrites
// here — a rewrite from / to /puzzleweek causes the RSC payload to embed
// route segments ["","puzzleweek"] while the browser URL stays at /, which
// crashes React hydration in App Router. The page.tsx approach has no such
// mismatch because the root route directly renders the right component.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|sounds/).*)'],
}
