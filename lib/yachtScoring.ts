export type CategoryId =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'fourOfAKind' | 'fullHouse' | 'fourStraight' | 'fiveStraight' | 'yacht' | 'choice'

export interface CategoryDef {
  id: CategoryId
  label: string
  section: 'upper' | 'lower'
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'ones',         label: '1s',          section: 'upper' },
  { id: 'twos',         label: '2s',          section: 'upper' },
  { id: 'threes',       label: '3s',          section: 'upper' },
  { id: 'fours',        label: '4s',          section: 'upper' },
  { id: 'fives',        label: '5s',          section: 'upper' },
  { id: 'sixes',        label: '6s',          section: 'upper' },
  { id: 'fourOfAKind',  label: '4 of a Kind', section: 'lower' },
  { id: 'fullHouse',    label: 'Full House',  section: 'lower' },
  { id: 'fourStraight', label: '4 Straight',  section: 'lower' },
  { id: 'fiveStraight', label: '5 Straight',  section: 'lower' },
  { id: 'yacht',        label: 'The Yacht',   section: 'lower' },
  { id: 'choice',       label: 'Choice',      section: 'lower' },
]

export const UPPER_IDS: CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
export const LOWER_IDS: CategoryId[] = ['fourOfAKind', 'fullHouse', 'fourStraight', 'fiveStraight', 'yacht', 'choice']

function countValues(dice: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of dice) m.set(d, (m.get(d) ?? 0) + 1)
  return m
}

export function scoreCategory(id: CategoryId, dice: number[]): number {
  const counts = countValues(dice)
  switch (id) {
    case 'ones':   return dice.filter(d => d === 1).length
    case 'twos':   return dice.filter(d => d === 2).length * 2
    case 'threes': return dice.filter(d => d === 3).length * 3
    case 'fours':  return dice.filter(d => d === 4).length * 4
    case 'fives':  return dice.filter(d => d === 5).length * 5
    case 'sixes':  return dice.filter(d => d === 6).length * 6
    case 'fourOfAKind': {
      for (const [val, cnt] of counts) if (cnt >= 4) return val * 4
      return 0
    }
    case 'fullHouse': {
      const vals = [...counts.values()].sort((a, b) => a - b)
      return vals.length === 2 && vals[0] === 2 && vals[1] === 3 ? 25 : 0
    }
    case 'fourStraight': {
      const s = new Set(dice)
      return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(run => run.every(v => s.has(v))) ? 30 : 0
    }
    case 'fiveStraight': {
      const s = new Set(dice)
      return (
        [1,2,3,4,5].every(v => s.has(v)) || [2,3,4,5,6].every(v => s.has(v))
      ) ? 40 : 0
    }
    case 'yacht':  return counts.size === 1 ? 50 : 0
    case 'choice': return dice.reduce((sum, d) => sum + d, 0)
  }
}

export function computeTotals(scored: Partial<Record<CategoryId, number>>): {
  upperSubtotal: number
  upperBonus: number
  lowerSubtotal: number
  grandTotal: number
} {
  const upperSubtotal = UPPER_IDS.reduce((s, id) => s + (scored[id] ?? 0), 0)
  const upperBonus = upperSubtotal >= 63 ? 35 : 0
  const lowerSubtotal = LOWER_IDS.reduce((s, id) => s + (scored[id] ?? 0), 0)
  return {
    upperSubtotal,
    upperBonus,
    lowerSubtotal,
    grandTotal: upperSubtotal + upperBonus + lowerSubtotal,
  }
}
