import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })

  const sheetsRegex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  const match = url.match(sheetsRegex)
  if (!match) return NextResponse.json({ error: 'Not a valid Google Sheets URL' }, { status: 400 })

  const sheetId = match[1]
  const gidMatch = url.match(/gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`

  try {
    const response = await fetch(csvUrl, { headers: { 'User-Agent': 'AbraStat/1.0' } })
    if (!response.ok) {
      return NextResponse.json(
        { error: "We couldn't access this sheet. Make sure it's shared with 'Anyone with the link'." },
        { status: 403 }
      )
    }
    const csvText = await response.text()
    return new NextResponse(csvText, { headers: { 'Content-Type': 'text/csv' } })
  } catch {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
