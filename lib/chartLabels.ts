export function truncateChartLabel(label: string | null | undefined, maxLength = 36): string {
  const text = String(label ?? '').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
