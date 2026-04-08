'use client'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildPlainTextTable(rows: Array<Array<string | number>>) {
  return rows.map(row => row.map(cell => String(cell)).join('\t')).join('\n')
}

export function buildHtmlTable(rows: Array<Array<string | number>>, headerRowCount = 1) {
  const headerRows = rows.slice(0, headerRowCount)
  const bodyRows = rows.slice(headerRowCount)
  const cellStyle = 'border:1px solid #cbd5e1;padding:6px 10px;font-family:Arial,sans-serif;font-size:12px;color:#0f172a;'
  const headerStyle = `${cellStyle}background:#e2e8f0;font-weight:600;`
  const bodyHeaderStyle = `${cellStyle}background:#f8fafc;font-weight:600;`

  return [
    '<table style="border-collapse:collapse;border-spacing:0;">',
    ...(headerRows.length > 0 ? [
      '<thead>',
      ...headerRows.map(row => `<tr>${row.map(cell => `<th style="${headerStyle}">${escapeHtml(String(cell))}</th>`).join('')}</tr>`),
      '</thead>',
    ] : []),
    '<tbody>',
    ...bodyRows.map((row, rowIndex) => `<tr>${row.map((cell, cellIndex) => {
      const style = cellIndex === 0 ? bodyHeaderStyle : cellStyle
      const tag = cellIndex === 0 ? 'th' : 'td'
      const scope = cellIndex === 0 ? ' scope="row"' : ''
      return `<${tag}${scope} style="${style}">${escapeHtml(String(cell))}</${tag}>`
    }).join('')}</tr>`),
    '</tbody>',
    '</table>',
  ].join('')
}

export async function writeClipboardTable(rows: Array<Array<string | number>>, headerRowCount = 1) {
  const plainText = buildPlainTextTable(rows)
  const htmlText = buildHtmlTable(rows, headerRowCount)

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([htmlText], { type: 'text/html' }),
      }),
    ])
    return
  }

  await navigator.clipboard.writeText(plainText)
}
