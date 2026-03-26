export interface DatasetCover {
  id: string
  bg: string   // CSS gradient
  emoji: string
  label: string
}

export const DATASET_COVERS: DatasetCover[] = [
  // Stats & Data
  { id: 'teal-chart',      bg: 'linear-gradient(135deg,#0EA5A0,#0369a1)',  emoji: '📊', label: 'Chart' },
  { id: 'indigo-data',     bg: 'linear-gradient(135deg,#6366F1,#4338ca)',  emoji: '📈', label: 'Trend' },
  { id: 'sky-numbers',     bg: 'linear-gradient(135deg,#0ea5e9,#0284c7)',  emoji: '🔢', label: 'Numbers' },
  { id: 'cyan-stats',      bg: 'linear-gradient(135deg,#06b6d4,#0891b2)',  emoji: '📉', label: 'Stats' },

  // Science
  { id: 'emerald-science', bg: 'linear-gradient(135deg,#10B981,#059669)',  emoji: '🔬', label: 'Science' },
  { id: 'lime-biology',    bg: 'linear-gradient(135deg,#84cc16,#65a30d)',  emoji: '🧬', label: 'Biology' },
  { id: 'violet-chem',     bg: 'linear-gradient(135deg,#8B5CF6,#7c3aed)',  emoji: '⚗️', label: 'Chemistry' },
  { id: 'blue-space',      bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  emoji: '🔭', label: 'Space' },

  // Sports
  { id: 'orange-hoops',    bg: 'linear-gradient(135deg,#F97316,#ea580c)',  emoji: '🏀', label: 'Basketball' },
  { id: 'green-soccer',    bg: 'linear-gradient(135deg,#22c55e,#16a34a)',  emoji: '⚽', label: 'Soccer' },
  { id: 'red-football',    bg: 'linear-gradient(135deg,#EF4444,#dc2626)',  emoji: '🏈', label: 'Football' },
  { id: 'yellow-trophy',   bg: 'linear-gradient(135deg,#eab308,#ca8a04)',  emoji: '🏆', label: 'Trophy' },

  // Nature & Weather
  { id: 'green-nature',    bg: 'linear-gradient(135deg,#4ade80,#16a34a)',  emoji: '🌿', label: 'Nature' },
  { id: 'blue-ocean',      bg: 'linear-gradient(135deg,#38bdf8,#0369a1)',  emoji: '🌊', label: 'Ocean' },
  { id: 'amber-weather',   bg: 'linear-gradient(135deg,#F59E0B,#d97706)',  emoji: '🌤️', label: 'Weather' },
  { id: 'teal-earth',      bg: 'linear-gradient(135deg,#2dd4bf,#0d9488)',  emoji: '🌍', label: 'Earth' },

  // Society & School
  { id: 'rose-people',     bg: 'linear-gradient(135deg,#EC4899,#db2777)',  emoji: '👥', label: 'People' },
  { id: 'purple-school',   bg: 'linear-gradient(135deg,#a855f7,#9333ea)',  emoji: '🏫', label: 'School' },
  { id: 'slate-econ',      bg: 'linear-gradient(135deg,#64748B,#334155)',  emoji: '💰', label: 'Economics' },
  { id: 'gray-survey',     bg: 'linear-gradient(135deg,#94a3b8,#64748b)',  emoji: '📋', label: 'Survey' },

  // Health & Food
  { id: 'pink-health',     bg: 'linear-gradient(135deg,#f472b6,#ec4899)',  emoji: '❤️', label: 'Health' },
  { id: 'red-food',        bg: 'linear-gradient(135deg,#f87171,#ef4444)',  emoji: '🍎', label: 'Food' },

  // Transport & Tech
  { id: 'blue-transport',  bg: 'linear-gradient(135deg,#60a5fa,#3b82f6)',  emoji: '🚗', label: 'Transport' },
  { id: 'zinc-tech',       bg: 'linear-gradient(135deg,#a1a1aa,#52525b)',  emoji: '💡', label: 'Tech' },
]

export const COVER_IDS = new Set(DATASET_COVERS.map(c => c.id))

export function isCoverId(val: string): boolean {
  return COVER_IDS.has(val)
}

export function getCover(val: string): DatasetCover | undefined {
  return DATASET_COVERS.find(c => c.id === val)
}

export function randomCoverId(): string {
  return DATASET_COVERS[Math.floor(Math.random() * DATASET_COVERS.length)].id
}
