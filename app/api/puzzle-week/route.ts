import { NextRequest, NextResponse } from 'next/server'
import {
  adminRenamePuzzleWeekEntryServer,
  adminRemovePuzzleWeekMemberServer,
  adminResetPuzzleWeekEntryServer,
  getPuzzleWeekBonusMedalsServer,
  getPuzzleWeekAdminEntriesServer,
  getPuzzleWeekLeaderboardServer,
  getPuzzleWeekProgressServer,
  getPuzzleWeekRegistrationServer,
  getPuzzleWeekVotesServer,
  joinPuzzleWeekTeamServer,
  registerPuzzleWeekSoloServer,
  registerPuzzleWeekTeamServer,
  resetPuzzleWeekRegistrationServer,
  savePuzzleWeekBonusMedalsServer,
  submitPuzzleWeekAnswerServer,
  submitPuzzleWeekVoteServer,
  verifyPuzzleWeekRequest,
} from '@/lib/puzzleWeekServer'
import { PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION } from '@/lib/puzzleWeek'
import type { PuzzleWeekBonusMedals, PuzzleWeekVote } from '@/lib/puzzleWeek'

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

    if (action === 'voteData') {
      let userId: string | undefined
      const authHeader = request.headers.get('authorization')
      if (authHeader) {
        try {
          const voteUser = await verifyPuzzleWeekRequest(authHeader)
          userId = voteUser.uid
        } catch { /* unauthenticated is fine — tally is public */ }
      }
      const data = await getPuzzleWeekVotesServer(eventId, userId)
      return NextResponse.json(data)
    }

    const user = await verifyPuzzleWeekRequest(request.headers.get('authorization'))

    if (action === 'adminEntries') {
      const adminEntries = await getPuzzleWeekAdminEntriesServer(eventId, user)
      return NextResponse.json(adminEntries)
    }

    if (action === 'registration') {
      const registration = await getPuzzleWeekRegistrationServer(eventId, user)
      return NextResponse.json(registration)
    }

    if (action === 'bonusMedals') {
      const medals = await getPuzzleWeekBonusMedalsServer(eventId, user)
      return NextResponse.json(medals)
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
      entryId?: string
      memberId?: string
      name?: string
      joinCode?: string
      puzzleId?: string
      answer?: string
      easiest?: string
      hardest?: string
      favorite?: string
      medals?: PuzzleWeekBonusMedals
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
      case 'resetRegistration':
        await resetPuzzleWeekRegistrationServer(body.eventId, user)
        return NextResponse.json({ ok: true })
      case 'adminRenameEntry':
        await adminRenamePuzzleWeekEntryServer(body.eventId, user, body.entryId ?? '', body.name ?? '')
        return NextResponse.json({ ok: true })
      case 'adminResetEntry':
        await adminResetPuzzleWeekEntryServer(body.eventId, user, body.entryId ?? '')
        return NextResponse.json({ ok: true })
      case 'adminRemoveMember':
        await adminRemovePuzzleWeekMemberServer(body.eventId, user, body.memberId ?? '')
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
      case 'submitVote': {
        const vote: PuzzleWeekVote = {
          easiest: typeof body.easiest === 'string' ? body.easiest : null,
          hardest: typeof body.hardest === 'string' ? body.hardest : null,
          favorite: typeof body.favorite === 'string' ? body.favorite : null,
        }
        await submitPuzzleWeekVoteServer(body.eventId, user, vote)
        return NextResponse.json({ ok: true })
      }
      case 'saveBonusMedals':
        await savePuzzleWeekBonusMedalsServer(body.eventId, user, body.medals ?? {
          slider: [],
          lightsOut: [],
          netwalk: [],
          game2048: [],
          queens: [],
          queensSolved: { easy: [], medium: [], hard: [] },
          queensSolvedOrderVersion: PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION,
          starBattle: [],
          starBattleSolved: { easy: [], medium: [], hard: [] },
          starBattleSolvedVersion: 4,
        })
        return NextResponse.json({ ok: true })
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
