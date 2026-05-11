import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|logo.svg|sounds/).*)'],
}
