import { NextRequest, NextResponse } from 'next/server'
import {
  getPuzzleWeekLeaderboardServer,
  getPuzzleWeekProgressServer,
  getPuzzleWeekRegistrationServer,
  joinPuzzleWeekTeamServer,
  registerPuzzleWeekSoloServer,
  registerPuzzleWeekTeamServer,
  submitPuzzleWeekAnswerServer,
  verifyPuzzleWeekRequest,
} from '@/lib/puzzleWeekServer'

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action')
    const eventId = request.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId.' }, { status: 400 })
    }

    if (action === 'leaderboard') {
      const leaderboard = await getPuzzleWeekLeaderboardServer(eventId)
      return NextResponse.json(leaderboard)
    }

    const user = await verifyPuzzleWeekRequest(request.headers.get('authorization'))

    if (action === 'registration') {
      const registration = await getPuzzleWeekRegistrationServer(eventId, user)
      return NextResponse.json(registration)
    }

    if (action === 'progress') {
      const registration = await getPuzzleWeekRegistrationServer(eventId, user)
      const progress = registration.entry
        ? await getPuzzleWeekProgressServer(eventId, registration.entry.id)
        : []
      return NextResponse.json(progress)
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Puzzle Week request failed.' },
      { status: 400 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyPuzzleWeekRequest(request.headers.get('authorization'))
    const body = await request.json() as {
      action?: string
      eventId?: string
      teamName?: string
      joinCode?: string
      puzzleId?: string
      answer?: string
    }
    if (!body.eventId) {
      return NextResponse.json({ error: 'Missing eventId.' }, { status: 400 })
    }

    switch (body.action) {
      case 'registerSolo':
        await registerPuzzleWeekSoloServer(body.eventId, user)
        return NextResponse.json({ ok: true })
      case 'registerTeam':
        await registerPuzzleWeekTeamServer(body.eventId, user, body.teamName ?? '')
        return NextResponse.json({ ok: true })
      case 'joinTeam':
        await joinPuzzleWeekTeamServer(body.eventId, user, body.joinCode ?? '')
        return NextResponse.json({ ok: true })
      case 'submitAnswer': {
        const result = await submitPuzzleWeekAnswerServer(
          body.eventId,
          user,
          body.puzzleId ?? '',
          body.answer ?? '',
        )
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Puzzle Week request failed.' },
      { status: 400 },
    )
  }
}
