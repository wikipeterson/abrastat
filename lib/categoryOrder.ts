export function sortCategoryValues(values: string[]): string[] {
  return [...values].sort((a, b) => compareCategoryValues(a, b))
}

function compareCategoryValues(a: string, b: string) {
  const aTrim = a.trim()
  const bTrim = b.trim()

  const aNum = Number(aTrim)
  const bNum = Number(bTrim)
  const aIsNum = aTrim !== '' && Number.isFinite(aNum)
  const bIsNum = bTrim !== '' && Number.isFinite(bNum)

  if (aIsNum && bIsNum) return aNum - bNum
  if (aIsNum !== bIsNum) return aIsNum ? -1 : 1

  return aTrim.localeCompare(bTrim, undefined, { numeric: true, sensitivity: 'base' })
}
