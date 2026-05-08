import { access, readFile } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { getPuzzleWeekPacketMessage, canDownloadPuzzleWeekPacketIdentity } from '@/lib/featureFlags'
import { verifyPuzzleWeekRequest } from '@/lib/puzzleWeekServer'

export const runtime = 'nodejs'

const PACKET_FILENAME = 'HaverfordPuzzleWeek2026.pdf'
const PACKET_PATH = new URL('../../../../private/puzzle-week/puzzle-week-2026.pdf', import.meta.url)

function buildPlaceholderPacketPdf() {
  const lines = [
    'Puzzle Week 2026',
    'Temporary puzzle pack placeholder.',
    'Replace private/puzzle-week/puzzle-week-2026.pdf with the real packet.',
  ]
  const content = [
    'BT',
    '/F1 24 Tf',
    '72 720 Td',
    `(${lines[0]}) Tj`,
    '0 -36 Td',
    '/F1 14 Tf',
    `(${lines[1]}) Tj`,
    '0 -24 Td',
    `(${lines[2]}) Tj`,
    'ET',
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${object}\n`
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf, 'utf8')
}

async function getPacketBuffer() {
  try {
    await access(PACKET_PATH)
    return await readFile(PACKET_PATH)
  } catch {
    return buildPlaceholderPacketPdf()
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyPuzzleWeekRequest(request.headers.get('authorization'))
    if (!canDownloadPuzzleWeekPacketIdentity(user)) {
      return NextResponse.json(
        { error: getPuzzleWeekPacketMessage(user) ?? 'The puzzle pack is not available yet.' },
        { status: 403 },
      )
    }

    const packet = await getPacketBuffer()
    return new NextResponse(packet, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${PACKET_FILENAME}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not download the puzzle pack.' },
      { status: 400 },
    )
  }
}
