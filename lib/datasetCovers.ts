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
  { id: 'emerald-calendar', bg: 'linear-gradient(135deg,#14b8a6,#0f766e)', emoji: '📆', label: 'Calendar' },
  { id: 'violet-percent',   bg: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', emoji: '💯', label: 'Percent' },
  { id: 'amber-bars',       bg: 'linear-gradient(135deg,#f59e0b,#d97706)', emoji: '📶', label: 'Bars' },
  { id: 'rose-line',        bg: 'linear-gradient(135deg,#fb7185,#e11d48)', emoji: '〽️', label: 'Line' },

  // Science
  { id: 'emerald-science', bg: 'linear-gradient(135deg,#10B981,#059669)',  emoji: '🔬', label: 'Science' },
  { id: 'lime-biology',    bg: 'linear-gradient(135deg,#84cc16,#65a30d)',  emoji: '🧬', label: 'Biology' },
  { id: 'violet-chem',     bg: 'linear-gradient(135deg,#8B5CF6,#7c3aed)',  emoji: '⚗️', label: 'Chemistry' },
  { id: 'blue-space',      bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  emoji: '🔭', label: 'Space' },
  { id: 'cyan-physics',    bg: 'linear-gradient(135deg,#06b6d4,#2563eb)',  emoji: '🧲', label: 'Physics' },
  { id: 'amber-dino',      bg: 'linear-gradient(135deg,#f59e0b,#ea580c)',  emoji: '🦖', label: 'Fossils' },
  { id: 'pink-brain',      bg: 'linear-gradient(135deg,#ec4899,#db2777)',  emoji: '🧠', label: 'Brain' },
  { id: 'teal-leaflab',    bg: 'linear-gradient(135deg,#34d399,#0f766e)',  emoji: '🧪', label: 'Lab' },

  // Sports
  { id: 'orange-hoops',    bg: 'linear-gradient(135deg,#F97316,#ea580c)',  emoji: '🏀', label: 'Basketball' },
  { id: 'green-soccer',    bg: 'linear-gradient(135deg,#22c55e,#16a34a)',  emoji: '⚽', label: 'Soccer' },
  { id: 'red-football',    bg: 'linear-gradient(135deg,#EF4444,#dc2626)',  emoji: '🏈', label: 'Football' },
  { id: 'yellow-trophy',   bg: 'linear-gradient(135deg,#eab308,#ca8a04)',  emoji: '🏆', label: 'Trophy' },
  { id: 'blue-baseball',   bg: 'linear-gradient(135deg,#60a5fa,#2563eb)',  emoji: '⚾', label: 'Baseball' },
  { id: 'teal-tennis',     bg: 'linear-gradient(135deg,#2dd4bf,#0f766e)',  emoji: '🎾', label: 'Tennis' },
  { id: 'violet-volley',   bg: 'linear-gradient(135deg,#818cf8,#6366f1)',  emoji: '🏐', label: 'Volleyball' },
  { id: 'slate-runner',    bg: 'linear-gradient(135deg,#94a3b8,#475569)',  emoji: '🏃', label: 'Running' },

  // Nature & Weather
  { id: 'green-nature',    bg: 'linear-gradient(135deg,#4ade80,#16a34a)',  emoji: '🌿', label: 'Nature' },
  { id: 'blue-ocean',      bg: 'linear-gradient(135deg,#38bdf8,#0369a1)',  emoji: '🌊', label: 'Ocean' },
  { id: 'amber-weather',   bg: 'linear-gradient(135deg,#F59E0B,#d97706)',  emoji: '🌤️', label: 'Weather' },
  { id: 'teal-earth',      bg: 'linear-gradient(135deg,#2dd4bf,#0d9488)',  emoji: '🌍', label: 'Earth' },
  { id: 'indigo-night',    bg: 'linear-gradient(135deg,#6366f1,#312e81)',  emoji: '🌙', label: 'Night' },
  { id: 'sky-rain',        bg: 'linear-gradient(135deg,#38bdf8,#0f766e)',  emoji: '🌧️', label: 'Rain' },
  { id: 'rose-flower',     bg: 'linear-gradient(135deg,#fb7185,#db2777)',  emoji: '🌸', label: 'Flower' },
  { id: 'emerald-tree',    bg: 'linear-gradient(135deg,#22c55e,#15803d)',  emoji: '🌳', label: 'Tree' },

  // Society & School
  { id: 'rose-people',     bg: 'linear-gradient(135deg,#EC4899,#db2777)',  emoji: '👥', label: 'People' },
  { id: 'purple-school',   bg: 'linear-gradient(135deg,#a855f7,#9333ea)',  emoji: '🏫', label: 'School' },
  { id: 'slate-econ',      bg: 'linear-gradient(135deg,#64748B,#334155)',  emoji: '💰', label: 'Economics' },
  { id: 'gray-survey',     bg: 'linear-gradient(135deg,#94a3b8,#64748b)',  emoji: '📋', label: 'Survey' },
  { id: 'blue-books',      bg: 'linear-gradient(135deg,#60a5fa,#1d4ed8)',  emoji: '📚', label: 'Books' },
  { id: 'amber-history',   bg: 'linear-gradient(135deg,#f59e0b,#b45309)',  emoji: '🏛️', label: 'History' },
  { id: 'teal-vote',       bg: 'linear-gradient(135deg,#14b8a6,#0f766e)',  emoji: '🗳️', label: 'Voting' },
  { id: 'indigo-family',   bg: 'linear-gradient(135deg,#818cf8,#4338ca)',  emoji: '👨‍👩‍👧‍👦', label: 'Family' },

  // Health & Food
  { id: 'pink-health',     bg: 'linear-gradient(135deg,#f472b6,#ec4899)',  emoji: '❤️', label: 'Health' },
  { id: 'red-food',        bg: 'linear-gradient(135deg,#f87171,#ef4444)',  emoji: '🍎', label: 'Food' },
  { id: 'orange-pizza',    bg: 'linear-gradient(135deg,#fb923c,#ea580c)',  emoji: '🍕', label: 'Pizza' },
  { id: 'green-broccoli',  bg: 'linear-gradient(135deg,#4ade80,#15803d)',  emoji: '🥦', label: 'Veggies' },

  // Transport & Tech
  { id: 'blue-transport',  bg: 'linear-gradient(135deg,#60a5fa,#3b82f6)',  emoji: '🚗', label: 'Transport' },
  { id: 'zinc-tech',       bg: 'linear-gradient(135deg,#a1a1aa,#52525b)',  emoji: '💡', label: 'Tech' },
  { id: 'sky-plane',       bg: 'linear-gradient(135deg,#38bdf8,#2563eb)',  emoji: '✈️', label: 'Air Travel' },
  { id: 'emerald-bike',    bg: 'linear-gradient(135deg,#34d399,#059669)',  emoji: '🚲', label: 'Bike' },
  { id: 'violet-robot',    bg: 'linear-gradient(135deg,#a78bfa,#6d28d9)',  emoji: '🤖', label: 'Robot' },
  { id: 'amber-phone',     bg: 'linear-gradient(135deg,#fbbf24,#d97706)',  emoji: '📱', label: 'Phone' },
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
