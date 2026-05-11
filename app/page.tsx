import { headers } from 'next/headers'
import { PuzzleWeekHub } from '@/components/library/PuzzleWeekHub'
import { LandingPage } from '@/components/LandingPage'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const headersList = await headers()
  const host = (
    headersList.get('x-forwarded-host') ??
    headersList.get('host') ??
    ''
  ).toLowerCase().split(':')[0]
  if (host === 'puzzleweek.abrastat.com' || host === 'puzzleweek.localhost') {
    return <PuzzleWeekHub />
  }
  return <LandingPage />
}
