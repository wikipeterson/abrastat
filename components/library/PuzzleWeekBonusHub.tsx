'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Calendar, Menu } from 'lucide-react'
import { useAuth } from '@/components/auth/AuthProvider'
import { signOut } from '@/lib/auth'
import { canManagePuzzleWeekIdentity } from '@/lib/featureFlags'
import {
  CURRENT_PUZZLE_WEEK_EVENT,
  getPuzzleWeekBonusMedals,
  PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION,
  savePuzzleWeekBonusMedals,
  type PuzzleWeekBonusMedals,
  type PuzzleWeekQueensSolvedBoards,
} from '@/lib/puzzleWeek'

// ---------- game constants ----------

const GAME_2048_SIZE = 4
const DIR_BITS = [1, 2, 4, 8] as const

// ---------- slider levels ----------

type SliderLevel = 'easy' | 'medium' | 'hard'
const SLIDER_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
const SLIDER_LABELS: Record<SliderLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const SLIDER_MEDALS: Record<SliderLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const SLIDER_MEDALS_KEY = 'pw-slider-medals'
const LIGHTS_OUT_SIZES: Record<SliderLevel, number> = { easy: 3, medium: 4, hard: 5 }
const LIGHTS_OUT_LABELS: Record<SliderLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const LIGHTS_OUT_MEDALS: Record<SliderLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const LIGHTS_OUT_MEDALS_KEY = 'pw-lightsout-medals'

// ---------- netwalk levels ----------

type NetwalkLevel = 'easy' | 'medium' | 'hard'
const NETWALK_SIZES: Record<NetwalkLevel, number> = { easy: 3, medium: 5, hard: 7 }
const NETWALK_LABELS: Record<NetwalkLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const NETWALK_MEDALS: Record<NetwalkLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const NETWALK_MEDALS_KEY = 'pw-netwalk-medals'

// ---------- queens levels ----------

type QueensLevel = 'easy' | 'medium' | 'hard'
const QUEENS_LABELS: Record<QueensLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const QUEENS_MEDALS: Record<QueensLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const QUEENS_MEDALS_KEY = 'pw-queens-medals'
const QUEENS_SOLVED_ORDER_VERSION_KEY = 'pw-queens-solved-order-version'
const QUEENS_EASY_OLD_TO_NEW = [4, 3, 9, 5, 6, 8, 1, 2, 0, 7] as const
const QUEENS_MEDIUM_OLD_TO_NEW = [2, 0, 3, 4, 7, 1, 5, 6, 8, 9] as const
const QUEENS_HARD_OLD_TO_NEW = [2, 8, 0, 3, 1, 9, 6, 7, 4, 5] as const
const QUEENS_SOLVED_KEYS: Record<QueensLevel, string> = {
  easy: 'pw-queens-solved-easy',
  medium: 'pw-queens-solved-medium',
  hard: 'pw-queens-solved-hard',
}

// ---------- star battle levels ----------

type StarBattleLevel = 'easy' | 'medium' | 'hard'
const STAR_BATTLE_LABELS: Record<StarBattleLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const STAR_BATTLE_MEDALS: Record<StarBattleLevel, string> = { easy: '🥉', medium: '🥈', hard: '🥇' }
const STAR_BATTLE_MEDALS_KEY = 'pw-starbattle-medals'
const STAR_BATTLE_SOLVED_KEYS: Record<StarBattleLevel, string> = {
  easy: 'pw-starbattle-solved-easy',
  medium: 'pw-starbattle-solved-medium',
  hard: 'pw-starbattle-solved-hard',
}

// Each puzzle: size×size grid, regions[] maps cell index→region id (0-based), solution is Set of star indices
type StarBattlePuzzle = { size: number; regions: number[]; solution: number[] }

// 8×8, 8 regions, 2 stars per row/col/region — 10 verified unique-solution puzzles
const SB_EASY: StarBattlePuzzle[] = [
  {
    size: 8,
    regions: [
      3,3,3,4,4,1,1,1,
      3,3,3,4,4,1,1,1,
      3,3,3,4,4,1,1,1,
      5,5,6,4,4,4,1,1,
      5,5,6,6,4,7,7,7,
      5,5,6,6,6,6,7,7,
      5,5,2,2,6,0,0,0,
      2,2,2,2,2,0,0,0,
    ],
    solution: [4,6,8,10,20,22,24,26,37,39,41,43,53,55,57,59],
  },
  {
    size: 8,
    regions: [
      7,7,0,0,0,3,3,3,
      7,7,7,0,3,3,3,3,
      7,7,7,0,3,3,3,3,
      7,7,7,7,5,2,2,2,
      6,7,1,1,5,5,2,2,
      6,6,1,1,5,5,5,2,
      6,6,1,1,1,4,4,4,
      6,6,6,1,4,4,4,4,
    ],
    solution: [1,3,13,15,17,19,29,31,32,34,44,46,48,50,60,62],
  },
  {
    size: 8,
    regions: [
      3,3,7,7,7,7,6,6,
      3,3,7,7,7,6,6,6,
      1,3,7,7,7,6,6,6,
      1,1,1,1,2,2,2,2,
      1,1,1,2,2,2,2,0,
      5,5,5,4,4,2,0,0,
      5,5,5,5,4,0,0,0,
      5,5,5,5,4,0,0,0,
    ],
    solution: [1,3,13,15,17,19,29,31,32,34,44,46,48,50,60,62],
  },
  {
    size: 8,
    regions: [
      0,0,6,6,5,5,5,5,
      0,0,6,6,7,7,7,7,
      0,0,6,6,7,7,7,7,
      0,0,6,6,4,4,4,4,
      1,1,6,6,4,4,4,4,
      1,1,1,1,3,3,3,4,
      2,2,2,2,3,3,3,3,
      2,2,2,2,3,3,3,3,
    ],
    solution: [4,6,8,10,20,22,24,26,37,39,41,43,53,55,57,59],
  },
  {
    size: 8,
    regions: [
      1,1,1,1,3,3,5,5,
      4,4,4,3,3,3,5,5,
      4,4,4,4,3,3,5,5,
      6,6,6,6,3,3,5,5,
      6,6,6,6,3,3,2,2,
      7,7,7,7,2,2,2,2,
      7,7,7,7,7,0,0,0,
      7,7,7,7,0,0,0,0,
    ],
    solution: [1,3,13,15,17,19,29,31,32,34,44,46,48,50,60,62],
  },
  {
    size: 8,
    regions: [
      1,1,1,5,5,5,5,5,
      1,1,1,3,0,0,0,0,
      7,1,1,3,0,0,0,0,
      7,3,3,3,6,6,0,4,
      7,7,3,3,6,6,4,4,
      7,7,3,3,6,6,6,4,
      7,2,2,2,2,6,6,4,
      2,2,2,2,2,2,6,4,
    ],
    solution: [4,6,8,10,20,22,24,26,37,39,41,43,53,55,57,59],
  },
  {
    size: 8,
    regions: [
      3,3,3,4,4,4,0,0,
      3,3,3,4,4,4,0,0,
      3,1,1,1,4,7,0,0,
      1,1,6,7,7,7,7,2,
      1,6,6,6,7,7,2,2,
      1,1,6,6,7,7,2,2,
      1,5,5,5,5,7,2,2,
      5,5,5,5,5,5,2,2,
    ],
    solution: [4,6,8,10,20,22,24,26,37,39,41,43,53,55,57,59],
  },
  {
    size: 8,
    regions: [
      5,5,5,5,3,3,4,4,
      0,5,5,3,3,4,4,4,
      0,0,5,3,3,7,4,4,
      0,0,5,3,7,7,4,4,
      2,0,5,5,7,7,4,6,
      2,2,1,1,1,7,6,6,
      2,2,1,1,1,7,6,6,
      2,2,1,1,1,1,1,6,
    ],
    solution: [4,6,8,10,20,22,24,26,37,39,41,43,53,55,57,59],
  },
  {
    size: 8,
    regions: [
      7,7,7,7,7,6,5,5,
      7,7,3,3,6,6,6,5,
      7,3,3,3,6,6,6,5,
      1,3,3,4,6,6,5,5,
      1,1,4,4,4,6,0,0,
      1,1,1,4,4,0,0,0,
      1,1,2,2,2,0,0,0,
      1,1,1,2,2,0,0,0,
    ],
    solution: [1,3,13,15,17,19,29,31,32,34,44,46,48,50,60,62],
  },
  {
    size: 8,
    regions: [
      4,4,4,4,3,3,3,5,
      4,4,4,3,3,3,3,5,
      6,6,6,2,3,3,3,5,
      6,6,6,2,2,3,5,5,
      6,6,2,2,2,2,5,5,
      6,1,2,2,0,0,7,7,
      1,1,1,0,0,0,7,7,
      1,1,1,0,0,0,7,7,
    ],
    solution: [1,3,13,15,17,19,29,31,32,34,44,46,48,50,60,62],
  },
]

// 10×10, 10 regions, 2 stars per row/col/region — 10 verified unique-solution puzzles
const SB_MEDIUM: StarBattlePuzzle[] = [
  {
    size: 10,
    regions: [
      5,5,5,1,8,8,8,2,2,2,
      5,5,5,1,1,8,2,2,2,2,
      5,5,5,1,1,1,2,2,2,2,
      5,5,4,2,2,2,2,2,2,2,
      4,4,4,4,4,2,2,2,9,9,
      4,4,4,4,4,4,7,7,9,9,
      4,3,3,4,4,0,7,7,7,9,
      6,3,3,3,0,0,0,7,9,9,
      6,6,3,3,0,0,0,7,9,9,
      6,6,3,3,0,0,0,9,9,9,
    ],
    solution: [4,6,11,18,23,25,30,38,42,44,57,59,62,65,70,77,83,89,91,96],
  },
  {
    size: 10,
    regions: [
      8,8,8,7,7,1,1,1,1,1,
      8,8,8,7,1,1,1,1,1,1,
      0,0,0,7,7,1,1,1,1,1,
      0,0,0,7,7,3,4,4,1,1,
      2,0,2,3,3,3,4,4,4,1,
      2,2,2,2,3,3,3,3,6,6,
      2,2,2,2,2,3,3,6,6,6,
      2,2,2,2,2,5,5,6,6,6,
      2,2,2,2,2,5,5,5,6,6,
      9,9,9,9,9,9,9,9,9,6,
    ],
    solution: [0,4,12,17,20,29,33,36,41,48,54,56,61,68,73,75,87,89,92,95],
  },
  {
    size: 10,
    regions: [
      7,7,7,7,3,3,2,2,2,2,
      7,7,7,7,3,3,2,2,2,2,
      7,7,7,7,3,3,3,3,3,3,
      4,7,7,8,8,3,3,3,3,3,
      4,4,8,8,8,5,5,3,3,6,
      4,1,8,8,5,5,5,6,6,6,
      1,1,1,1,9,5,5,5,5,6,
      1,1,1,9,9,5,5,5,5,5,
      1,1,9,9,9,9,5,5,0,0,
      1,1,9,9,9,9,9,0,0,0,
    ],
    solution: [1,6,14,18,22,26,30,34,42,49,50,57,63,65,71,78,83,85,97,99],
  },
  {
    size: 10,
    regions: [
      0,0,4,4,4,4,4,4,4,4,
      0,0,0,3,4,4,4,4,8,4,
      0,0,0,3,3,4,2,8,8,9,
      0,0,0,3,3,2,2,8,8,9,
      0,0,0,3,6,2,8,8,9,9,
      0,0,7,6,6,6,8,8,9,9,
      7,7,7,6,6,6,6,9,9,9,
      7,7,7,6,6,6,6,9,9,9,
      1,1,7,7,7,5,5,5,9,9,
      1,1,1,1,5,5,5,5,9,9,
    ],
    solution: [5,8,11,13,26,28,31,33,45,47,52,59,60,66,74,79,80,87,92,94],
  },
  {
    size: 10,
    regions: [
      7,7,7,7,7,5,4,4,4,4,
      3,7,7,7,7,5,4,4,4,4,
      3,3,7,7,7,5,4,4,9,9,
      3,3,7,7,7,9,9,9,9,9,
      3,3,3,7,9,9,9,9,9,9,
      3,3,8,8,8,9,9,2,2,2,
      6,3,8,8,8,8,9,2,2,2,
      6,8,8,8,1,1,0,2,2,2,
      6,6,6,1,1,1,0,0,2,2,
      6,6,6,6,1,1,0,0,0,0,
    ],
    solution: [2,5,17,19,21,25,33,38,41,46,53,59,60,67,72,74,80,86,94,98],
  },
  {
    size: 10,
    regions: [
      6,6,6,6,6,7,7,7,7,7,
      6,6,6,6,6,6,7,7,7,8,
      1,2,6,6,6,6,2,7,8,8,
      1,2,2,2,2,2,2,2,8,8,
      1,1,2,2,2,2,2,2,8,8,
      3,3,4,4,4,2,2,0,8,8,
      3,3,4,4,4,4,2,0,8,8,
      3,3,3,4,4,4,5,0,9,8,
      3,3,5,5,5,5,5,9,9,9,
      3,3,5,5,5,5,9,9,9,9,
    ],
    solution: [1,8,14,16,20,28,33,35,41,49,53,57,60,65,72,77,84,89,92,96],
  },
  {
    size: 10,
    regions: [
      0,0,0,0,8,8,8,8,8,8,
      4,0,0,0,0,8,9,9,8,8,
      4,5,0,0,0,9,9,9,9,7,
      4,5,5,5,5,9,9,9,7,7,
      5,5,5,5,5,5,7,7,7,7,
      5,5,5,7,7,7,7,7,7,7,
      5,2,2,2,7,7,6,6,6,6,
      2,2,2,2,2,6,6,6,6,6,
      3,3,3,2,2,6,6,1,1,6,
      3,3,3,3,2,2,6,1,1,1,
    ],
    solution: [5,7,10,12,24,28,30,36,42,44,56,58,61,63,75,79,81,87,93,99],
  },
  {
    size: 10,
    regions: [
      1,1,1,1,2,2,0,0,0,0,
      5,5,1,1,1,2,0,0,0,0,
      5,5,5,1,1,2,0,0,0,8,
      5,5,1,1,1,1,3,3,8,8,
      4,4,1,1,1,3,3,3,8,8,
      4,4,4,4,3,3,3,3,3,8,
      4,4,4,4,7,7,7,7,9,9,
      4,4,4,4,4,7,7,7,9,9,
      4,6,6,6,6,6,7,7,9,9,
      6,6,6,6,6,6,6,7,9,9,
    ],
    solution: [4,6,10,12,25,27,31,39,43,45,57,59,62,64,70,78,83,86,91,98],
  },
  {
    size: 10,
    regions: [
      8,9,9,7,7,7,7,7,7,7,
      8,9,9,9,2,2,6,6,6,7,
      8,8,9,9,2,2,2,6,6,6,
      8,9,9,9,2,2,2,2,6,6,
      5,9,9,9,2,2,3,3,4,4,
      5,9,9,9,0,0,3,3,4,4,
      5,5,9,1,0,0,0,3,4,4,
      5,5,5,1,1,0,0,0,0,4,
      5,5,5,1,1,0,0,0,0,0,
      5,5,5,1,1,0,0,0,0,0,
    ],
    solution: [3,5,10,17,22,25,30,38,44,46,51,59,63,67,71,79,84,86,92,98],
  },
  {
    size: 10,
    regions: [
      0,0,0,0,0,0,9,9,9,9,
      1,1,0,0,0,0,2,9,9,9,
      1,1,1,0,0,2,2,2,2,2,
      1,1,1,5,5,2,2,2,2,2,
      1,1,5,5,5,5,2,2,2,2,
      8,8,5,5,5,5,4,4,4,2,
      8,8,8,8,3,3,4,4,4,4,
      8,8,8,3,3,3,3,4,4,4,
      8,8,8,6,6,3,4,4,7,7,
      8,8,8,6,6,6,7,7,7,7,
    ],
    solution: [1,3,17,19,22,25,30,38,42,44,50,56,64,68,71,76,83,89,95,97],
  },
]
const SB_HARD: StarBattlePuzzle[] = [
  { size: 10,
    regions: [1,1,1,1,1,5,2,2,2,2,1,1,1,1,1,5,5,2,2,2,1,1,1,1,1,5,5,2,2,2,3,9,9,1,5,5,5,6,6,2,3,9,9,9,5,5,5,6,6,6,3,3,9,9,0,0,0,7,7,7,3,3,3,0,0,0,0,7,7,7,8,8,8,4,4,0,0,7,7,7,8,8,4,4,4,4,4,7,7,7,8,8,4,4,4,4,4,4,7,7],
    solution: [2,5,17,19,23,25,31,37,43,49,50,56,62,64,70,78,84,86,91,98] },
  { size: 10,
    regions: [8,8,8,8,1,1,1,1,1,1,8,8,8,8,1,1,0,0,1,4,9,9,9,8,0,0,0,0,0,4,9,9,9,9,5,0,0,0,0,4,9,9,9,5,5,5,5,7,7,7,9,9,5,5,5,5,7,7,7,7,3,3,3,3,5,5,2,2,7,7,3,3,3,3,3,2,2,2,2,2,6,6,6,6,6,6,2,2,2,2,6,6,6,6,6,6,2,2,2,2],
    solution: [5,7,11,19,23,25,37,39,42,44,50,56,64,68,70,72,86,88,91,93] },
  { size: 10,
    regions: [3,5,5,5,5,5,2,2,2,2,3,3,5,5,5,2,2,2,2,2,3,3,3,5,5,7,2,2,2,2,3,3,3,5,7,7,7,2,2,4,3,3,3,9,9,7,7,7,4,4,3,8,8,9,9,9,7,0,0,4,8,8,8,9,9,9,9,0,0,0,8,8,8,8,9,1,1,0,0,0,6,6,6,1,1,1,1,1,0,0,6,6,6,6,1,1,1,1,0,0],
    solution: [4,8,10,12,25,27,31,39,43,45,57,59,60,62,74,76,81,88,93,96] },
  { size: 10,
    regions: [1,4,4,4,4,7,7,9,9,9,1,8,4,4,7,7,7,7,7,9,1,8,4,4,4,7,7,7,2,2,1,8,8,8,6,7,7,2,2,2,1,8,8,6,6,6,2,2,2,2,1,8,6,6,6,6,5,5,0,0,1,8,3,6,6,6,5,5,5,0,1,3,3,3,6,6,5,5,5,0,3,3,3,3,3,5,5,5,0,0,3,3,3,3,3,3,0,0,0,0],
    solution: [4,7,12,19,25,27,31,33,46,48,50,52,64,66,70,79,83,85,91,98] },
  { size: 10,
    regions: [8,8,8,1,1,1,0,0,0,6,8,8,1,1,1,1,0,0,0,6,8,8,8,1,1,1,0,0,6,6,9,9,9,3,1,2,2,2,6,6,9,9,9,3,3,3,2,2,2,2,9,9,3,3,3,3,3,2,2,2,9,4,7,7,7,7,7,2,2,2,4,4,5,7,7,7,7,2,2,2,4,4,5,5,7,7,5,5,5,5,4,4,5,5,5,5,5,5,5,5],
    solution: [5,7,10,19,22,26,34,38,40,42,54,56,61,69,73,77,81,85,93,98] },
  { size: 10,
    regions: [2,2,2,6,6,8,4,4,4,7,2,2,2,2,6,8,4,4,4,7,0,2,2,6,6,8,8,4,7,7,0,0,0,6,6,8,8,4,7,3,0,0,5,6,6,8,8,3,3,3,9,9,5,5,6,8,8,3,3,3,9,5,5,5,5,8,3,3,3,3,9,5,5,5,5,8,1,1,1,1,9,9,5,5,5,1,1,1,1,1,9,9,5,5,1,1,1,1,1,1],
    solution: [6,9,11,13,27,29,32,34,40,48,54,56,62,68,70,75,83,87,91,95] },
  { size: 10,
    regions: [2,2,2,2,6,6,6,6,6,6,2,2,2,2,6,6,6,6,0,0,2,2,2,8,8,8,8,8,0,0,2,2,2,8,8,8,8,8,0,0,4,4,4,4,4,4,4,4,0,0,4,4,9,4,1,1,4,4,4,4,9,9,9,9,1,1,1,7,3,3,9,9,9,9,1,1,1,7,3,3,9,9,9,9,9,1,1,7,3,3,5,5,5,5,5,1,7,7,3,3],
    solution: [4,6,12,18,20,25,33,38,40,46,52,54,67,69,71,75,87,89,91,93] },
  { size: 10,
    regions: [7,7,7,8,8,8,8,8,8,8,7,7,7,7,8,8,8,8,8,8,7,7,7,5,5,5,9,9,9,9,4,5,5,5,5,5,9,9,9,9,4,4,3,3,9,9,9,0,0,9,4,4,3,3,3,9,0,0,0,0,4,4,3,3,3,0,0,0,0,0,4,4,3,3,6,6,6,0,0,2,4,4,1,1,1,1,6,6,2,2,4,1,1,1,1,1,1,1,2,2],
    solution: [5,7,11,13,26,28,32,34,40,48,54,56,60,62,75,79,83,87,91,99] },
  { size: 10,
    regions: [6,6,6,6,6,5,1,1,1,1,6,6,6,6,5,5,5,1,8,8,6,6,6,6,5,5,3,3,8,8,7,5,5,5,5,3,3,3,8,8,7,0,0,5,5,3,3,3,8,8,7,0,0,0,2,2,2,2,9,9,7,0,0,0,2,2,2,2,9,9,7,0,0,0,2,2,2,9,9,9,7,7,0,0,4,4,4,4,9,9,7,7,7,7,4,4,4,4,4,4],
    solution: [6,8,11,13,27,29,31,35,43,48,50,55,62,69,74,77,80,82,94,96] },
  { size: 10,
    regions: [5,5,5,5,8,6,6,6,6,4,5,5,5,0,8,6,6,6,6,4,5,5,5,0,8,8,6,6,4,4,5,0,0,0,0,8,6,4,4,4,3,0,0,0,0,8,8,4,4,4,3,2,2,2,2,8,8,4,1,4,3,2,2,2,2,2,1,1,1,1,3,9,9,2,7,7,1,1,1,1,3,9,9,7,7,7,7,1,1,1,3,3,9,7,7,7,7,1,1,1],
    solution: [3,7,11,19,25,27,32,39,44,46,50,58,63,65,71,78,84,86,90,92] },
]

const SB_PUZZLES: Record<StarBattleLevel, StarBattlePuzzle[]> = {
  easy: SB_EASY,
  medium: SB_MEDIUM,
  hard: SB_HARD,
}

const SB_REGION_COLORS = [
  '#bfdbfe','#bbf7d0','#fde68a','#fecaca','#e9d5ff',
  '#fed7aa','#a7f3d0','#fbcfe8','#cffafe','#d1d5db',
]

type Game2048Medal = 'bronze' | 'silver' | 'gold'
const GAME_2048_MEDALS: Record<Game2048Medal, { threshold: number; emoji: string; label: string }> = {
  bronze: { threshold: 512, emoji: '🥉', label: 'Bronze' },
  silver: { threshold: 1024, emoji: '🥈', label: 'Silver' },
  gold: { threshold: 2048, emoji: '🥇', label: 'Gold' },
}
const GAME_2048_MEDALS_KEY = 'pw-2048-medals'

type NetwalkCell = {
  baseMask: number
  rotation: number
  isServer: boolean
}

type Direction2048 = 'up' | 'down' | 'left' | 'right'

// ---------- Lights Out logic ----------

function toggleCell(board: boolean[], row: number, col: number, size: number) {
  const next = [...board]
  for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr, nc = col + dc
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
    next[nr * size + nc] = !next[nr * size + nc]
  }
  return next
}

function createLightsOutBoard(size: number) {
  let board = Array<boolean>(size * size).fill(false)
  const moves = size === 3 ? 8 + Math.floor(Math.random() * 4) : size === 4 ? 11 + Math.floor(Math.random() * 5) : 14 + Math.floor(Math.random() * 8)
  for (let i = 0; i < moves; i++) {
    const r = Math.floor(Math.random() * size)
    const c = Math.floor(Math.random() * size)
    board = toggleCell(board, r, c, size)
  }
  if (board.every(c => !c)) {
    const middle = Math.floor(size / 2)
    board = toggleCell(board, middle, middle, size)
  }
  return board
}

// ---------- Slider Puzzle logic ----------

function sliderNeighbors(emptyIdx: number, size: number) {
  const r = Math.floor(emptyIdx / size), c = emptyIdx % size
  const n: number[] = []
  if (r > 0) n.push(emptyIdx - size)
  if (r < size - 1) n.push(emptyIdx + size)
  if (c > 0) n.push(emptyIdx - 1)
  if (c < size - 1) n.push(emptyIdx + 1)
  return n
}

function createSliderBoard(size: number) {
  const total = size * size
  let board = Array.from({ length: total }, (_, i) => (i === total - 1 ? 0 : i + 1))
  let e = total - 1, prev = -1
  for (let i = 0; i < 200; i++) {
    const choices = sliderNeighbors(e, size).filter(n => n !== prev)
    const pick = choices[Math.floor(Math.random() * choices.length)]
    board[e] = board[pick]; board[pick] = 0
    prev = e; e = pick
  }
  if (board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))) {
    const nb = sliderNeighbors(e, size)[0]
    board[e] = board[nb]; board[nb] = 0
  }
  return board
}

// ---------- Netwalk logic ----------

function rotateMask(mask: number, turns: number) {
  const normalized = ((turns % 4) + 4) % 4
  if (normalized === 0) return mask
  return ((mask << normalized) | (mask >> (4 - normalized))) & 15
}

function netwalkNeighbors(index: number, size: number) {
  const row = Math.floor(index / size)
  const col = index % size
  const neighbors: Array<{ index: number; dir: number; opposite: number }> = []
  if (row > 0) neighbors.push({ index: index - size, dir: 0, opposite: 2 })
  if (col < size - 1) neighbors.push({ index: index + 1, dir: 1, opposite: 3 })
  if (row < size - 1) neighbors.push({ index: index + size, dir: 2, opposite: 0 })
  if (col > 0) neighbors.push({ index: index - 1, dir: 3, opposite: 1 })
  return neighbors
}

function createNetwalkBoard(size: number) {
  const total = size * size
  const root = Math.floor(total / 2)
  const visited = Array.from({ length: total }, () => false)
  const masks = Array.from({ length: total }, () => 0)

  function visit(index: number) {
    visited[index] = true
    const shuffled = netwalkNeighbors(index, size).sort(() => Math.random() - 0.5)
    for (const neighbor of shuffled) {
      if (visited[neighbor.index]) continue
      masks[index] |= DIR_BITS[neighbor.dir]
      masks[neighbor.index] |= DIR_BITS[neighbor.opposite]
      visit(neighbor.index)
    }
  }

  visit(root)

  const board = masks.map((baseMask, index) => ({
    baseMask,
    rotation: Math.floor(Math.random() * 4),
    isServer: index === root,
  }))

  if (board.every(cell => cell.rotation === 0 || cell.baseMask === 15)) {
    const rotatableIndex = board.findIndex(cell => cell.baseMask !== 15)
    if (rotatableIndex >= 0) {
      board[rotatableIndex] = { ...board[rotatableIndex], rotation: 1 }
    }
  }

  return board
}

// ---------- 2048 logic ----------

function createEmpty2048Board() {
  return Array<number>(GAME_2048_SIZE * GAME_2048_SIZE).fill(0)
}

function addRandom2048Tile(board: number[]) {
  const empty = board
    .map((value, index) => ({ value, index }))
    .filter(cell => cell.value === 0)

  if (!empty.length) return board

  const pick = empty[Math.floor(Math.random() * empty.length)]!.index
  const next = [...board]
  next[pick] = Math.random() < 0.9 ? 2 : 4
  return next
}

function create2048Board() {
  return addRandom2048Tile(addRandom2048Tile(createEmpty2048Board()))
}

function compress2048Line(line: number[]) {
  const compact = line.filter(Boolean)
  const merged: number[] = []
  let scoreGain = 0

  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i]! * 2
      merged.push(value)
      scoreGain += value
      i += 1
    } else {
      merged.push(compact[i]!)
    }
  }

  while (merged.length < GAME_2048_SIZE) merged.push(0)
  return { line: merged, scoreGain }
}

function move2048(board: number[], direction: Direction2048) {
  const next = [...board]
  let moved = false
  let scoreGain = 0

  const readLine = (index: number) => {
    const line: number[] = []
    for (let offset = 0; offset < GAME_2048_SIZE; offset += 1) {
      const row = direction === 'left' || direction === 'right' ? index : offset
      const col = direction === 'left' || direction === 'right' ? offset : index
      line.push(next[row * GAME_2048_SIZE + col]!)
    }
    return direction === 'right' || direction === 'down' ? line.reverse() : line
  }

  const writeLine = (index: number, line: number[]) => {
    const oriented = direction === 'right' || direction === 'down' ? [...line].reverse() : line
    for (let offset = 0; offset < GAME_2048_SIZE; offset += 1) {
      const row = direction === 'left' || direction === 'right' ? index : offset
      const col = direction === 'left' || direction === 'right' ? offset : index
      const targetIndex = row * GAME_2048_SIZE + col
      if (next[targetIndex] !== oriented[offset]) moved = true
      next[targetIndex] = oriented[offset]!
    }
  }

  for (let i = 0; i < GAME_2048_SIZE; i += 1) {
    const { line, scoreGain: gain } = compress2048Line(readLine(i))
    scoreGain += gain
    writeLine(i, line)
  }

  return { board: moved ? addRandom2048Tile(next) : board, moved, scoreGain }
}

function canMove2048(board: number[]) {
  if (board.includes(0)) return true
  for (let row = 0; row < GAME_2048_SIZE; row += 1) {
    for (let col = 0; col < GAME_2048_SIZE; col += 1) {
      const index = row * GAME_2048_SIZE + col
      const value = board[index]
      if (col < GAME_2048_SIZE - 1 && value === board[index + 1]) return true
      if (row < GAME_2048_SIZE - 1 && value === board[index + GAME_2048_SIZE]) return true
    }
  }
  return false
}

function getNetwalkStatus(board: NetwalkCell[], size: number) {
  const serverIndex = board.findIndex(cell => cell.isServer)
  const connectedIndices = new Set<number>()
  if (serverIndex === -1) return { solved: false, connectedCount: 0, connectedIndices }

  connectedIndices.add(serverIndex)
  const queue = [serverIndex]
  let looseEnds = false

  while (queue.length) {
    const index = queue.shift()!
    const mask = rotateMask(board[index].baseMask, board[index].rotation)

    for (const neighbor of netwalkNeighbors(index, size)) {
      const hasEdge = (mask & DIR_BITS[neighbor.dir]) !== 0
      const neighborMask = rotateMask(board[neighbor.index].baseMask, board[neighbor.index].rotation)
      const neighborHasEdge = (neighborMask & DIR_BITS[neighbor.opposite]) !== 0

      if (hasEdge !== neighborHasEdge) looseEnds = true

      if (hasEdge && neighborHasEdge && !connectedIndices.has(neighbor.index)) {
        connectedIndices.add(neighbor.index)
        queue.push(neighbor.index)
      }
    }
  }

  return {
    solved: !looseEnds && connectedIndices.size === board.length,
    connectedCount: connectedIndices.size,
    connectedIndices,
  }
}

// ---------- game components ----------

function SolvedOverlay({
  emoji,
  title,
  subtitle,
  medal,
  onNewPuzzle,
  onAdmire,
}: {
  emoji: string
  title: string
  subtitle: string
  medal?: string
  onNewPuzzle: () => void
  onAdmire: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)]/95 px-6 text-center">
      <div className="text-5xl" style={{ animation: 'pw-bounce 0.45s ease' }}>{emoji}</div>
      <p className="text-2xl font-bold text-[var(--color-text)]">{title}</p>
      <p className="text-sm text-[var(--color-muted)]">{subtitle}</p>
      {medal && (
        <p className="text-lg font-bold text-[var(--color-accent)]">{medal}</p>
      )}
      <div className="mt-2 flex w-full max-w-[220px] flex-col gap-2">
        <button
          type="button"
          onClick={onNewPuzzle}
          className="w-full rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:brightness-105"
        >
          New Puzzle?
        </button>
        <button
          type="button"
          onClick={onAdmire}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-white py-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
        >
          Admire your puzzle?
        </button>
      </div>
    </div>
  )
}

function BonusGameLayout({
  board,
  sidebar,
}: {
  board: ReactNode
  sidebar: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-stretch justify-center gap-3 p-3 lg:flex-row lg:items-stretch lg:justify-start lg:gap-4 lg:p-5">
      <div className="flex-shrink-0 lg:flex lg:min-h-0 lg:flex-1 lg:items-center lg:justify-center">
        <div className="aspect-square w-full lg:h-full lg:w-auto lg:max-w-none">
          {board}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col gap-2 lg:min-h-0 lg:w-[clamp(290px,28vw,350px)] lg:flex-shrink-0 lg:gap-2.5 lg:overflow-hidden">
        {sidebar}
      </div>
    </div>
  )
}

function BonusInfoCard({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 lg:px-4 lg:py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
        {label}
      </p>
      <div className="mt-1.5 text-[clamp(0.98rem,1.05vw,1.14rem)] leading-[1.45] text-[var(--color-text)]">
        {children}
      </div>
    </div>
  )
}

function BonusStatTile({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[clamp(1.45rem,1.8vw,2rem)] font-bold leading-none text-[var(--color-text)]">
        {value}
      </div>
    </div>
  )
}

function BonusHowToPlay({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="hidden lg:flex lg:flex-col lg:gap-2.5">
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-slate-50 lg:hidden"
      >
        How to play
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">?</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted)] transition hover:bg-slate-50"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">{children}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-1 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:brightness-105"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function lerpChannel(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}

function getSliderTileColors(value: number, total: number) {
  // t: 0 = lowest tile (1), 1 = highest tile (total-1)
  const t = (value - 1) / Math.max(total - 2, 1)
  let r: number, g: number, b: number
  if (t <= 0.5) {
    // teal (#9be8e3) → white
    const s = t * 2
    r = lerpChannel(155, 255, s); g = lerpChannel(232, 255, s); b = lerpChannel(227, 255, s)
  } else {
    // white → amber (#f8c478)
    const s = (t - 0.5) * 2
    r = lerpChannel(255, 248, s); g = lerpChannel(255, 196, s); b = lerpChannel(255, 120, s)
  }
  return {
    bg: `rgb(${r},${g},${b})`,
    text: t < 0.28 ? '#0d504e' : t > 0.72 ? '#7a3200' : '#334155',
    border: `rgb(${Math.round(r * 0.88)},${Math.round(g * 0.88)},${Math.round(b * 0.9)})`,
  }
}

function SliderPuzzleBoard({
  medals,
  onSolve,
}: {
  medals: Set<SliderLevel>
  onSolve: (level: SliderLevel) => void
}) {
  const [level, setLevel] = useState<SliderLevel>('medium')
  const size = SLIDER_SIZES[level]
  const [board, setBoard] = useState<number[]>(() => createSliderBoard(SLIDER_SIZES['medium']))
  const [moves, setMoves] = useState(0)
  const [boardKey, setBoardKey] = useState(0)
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayShownRef = useRef(false)

  const total = size * size
  const solved = board.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))

  useEffect(() => {
    if (solved && !overlayShownRef.current) {
      overlayShownRef.current = true
      const t = window.setTimeout(() => setShowOverlay(true), 380)
      return () => window.clearTimeout(t)
    }
    if (!solved) { overlayShownRef.current = false; setShowOverlay(false) }
  }, [solved])

  function newBoard() {
    setBoard(createSliderBoard(size)); setMoves(0); setBoardKey(k => k + 1); setShowOverlay(false)
  }

  function switchLevel(l: SliderLevel) {
    setLevel(l)
    setBoard(createSliderBoard(SLIDER_SIZES[l]))
    setMoves(0)
    setBoardKey(k => k + 1)
    setShowOverlay(false)
  }

  const emptyIdx = board.indexOf(0)
  const movableTiles = new Set(solved ? [] : sliderNeighbors(emptyIdx, size).map(index => board[index]).filter(Boolean))

  function handlePress(idx: number) {
    if (solved || !sliderNeighbors(emptyIdx, size).includes(idx)) return
    const next = [...board]
    const e = next.indexOf(0)
    next[e] = next[idx]; next[idx] = 0
    setBoard(next)
    setMoves(m => m + 1)
    if (next.every((v, i) => (i === total - 1 ? v === 0 : v === i + 1))) {
      onSolve(level)
    }
  }

  const gap = 8
  const totalGap = (size - 1) * gap
  const tileFont = size === 3 ? 'text-2xl' : size === 4 ? 'text-lg' : 'text-sm'

  return (
  <>
    <BonusGameLayout
      board={
        <div className="h-full w-full rounded-[1.65rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner">
          <div key={boardKey} className="relative h-full w-full rounded-[1.1rem] bg-white/50">
            <div
              className="absolute inset-0 grid"
              style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gap: `${gap}px` }}
            >
              {Array.from({ length: total }).map((_, idx) => (
                <div
                  key={`slot-${idx}`}
                  className="rounded-[0.95rem] border border-dashed border-slate-200 bg-white/80"
                />
              ))}
            </div>

            {board.map((value, idx) => {
              if (value === 0) return null
              const row = Math.floor(idx / size)
              const col = idx % size
              const movable = movableTiles.has(value)
              const colors = getSliderTileColors(value, total)
              return (
                <button
                  key={`${level}-${value}`}
                  type="button"
                  onClick={() => handlePress(idx)}
                  className={`absolute flex items-center justify-center rounded-[0.95rem] border font-semibold transition-[left,top,transform,box-shadow,border-color,background] duration-200 ease-out ${tileFont} ${
                    movable ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'
                  }`}
                  style={{
                    width: `calc((100% - ${totalGap}px) / ${size})`,
                    height: `calc((100% - ${totalGap}px) / ${size})`,
                    left: `calc(${col} * ((100% - ${totalGap}px) / ${size} + ${gap}px))`,
                    top: `calc(${row} * ((100% - ${totalGap}px) / ${size} + ${gap}px))`,
                    background: colors.bg,
                    color: colors.text,
                    borderColor: movable ? '#5eead4' : colors.border,
                    boxShadow: movable
                      ? '0 6px 18px rgba(14,165,160,0.22), 0 1px 3px rgba(14,165,160,0.1)'
                      : '0 2px 8px rgba(15,23,42,0.07)',
                  }}
                >
                  <span className="absolute inset-x-3 top-2 h-px rounded-full bg-white/60" />
                  <span className="relative">{value}</span>
                </button>
              )
            })}
          </div>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-2.5">
          <div className="hidden flex-shrink-0 lg:block">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Slider Puzzle
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Put the tiles in order.
            </h2>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {SLIDER_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {SLIDER_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-shrink-0 gap-2 lg:hidden">
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Moves</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{moves}</div>
            </div>
            <button
              type="button"
              onClick={newBoard}
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 transition hover:bg-slate-50"
            >
              <div className="text-sm font-bold text-[var(--color-text)]">New Board</div>
            </button>
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-slate-50"
            >
              How to play
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">?</span>
            </button>
          </div>
          <div className="hidden flex-shrink-0 grid-cols-2 gap-3 lg:grid">
            <BonusStatTile label="Moves" value={moves} />
            <button
              type="button"
              onClick={newBoard}
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="text-[clamp(1.15rem,1.55vw,1.55rem)] font-bold leading-none text-[var(--color-text)]">
                New Board
              </div>
            </button>
          </div>
          {solved && (
            <div className="flex-shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              🎉 {SLIDER_MEDALS[level]} {SLIDER_LABELS[level]} solved!
            </div>
          )}
          <div className="hidden lg:flex lg:flex-col lg:gap-2.5">
            <BonusInfoCard label="Goal">
              Arrange the numbered tiles from <strong>1</strong> up to the final tile so the empty space ends in the bottom-right corner.
            </BonusInfoCard>
            <BonusInfoCard label="How It Works">
              Only tiles touching the empty space can move. Click or tap an adjacent tile to slide it into the gap.
            </BonusInfoCard>
          </div>
          {howToPlayOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setHowToPlayOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
                  <button
                    type="button"
                    onClick={() => setHowToPlayOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <BonusInfoCard label="Goal">
                    Arrange the numbered tiles from <strong>1</strong> up to the final tile so the empty space ends in the bottom-right corner.
                  </BonusInfoCard>
                  <BonusInfoCard label="How It Works">
                    Only tiles touching the empty space can move. Click or tap an adjacent tile to slide it into the gap.
                  </BonusInfoCard>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToPlayOpen(false)}
                  className="mt-1 w-full rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
    {showOverlay && (
      <SolvedOverlay
        emoji="🧩"
        title="Puzzle solved!"
        subtitle={`${moves} move${moves !== 1 ? 's' : ''}`}
        medal={medals.has(level) ? undefined : `${SLIDER_MEDALS[level]} New medal earned!`}
        onNewPuzzle={newBoard}
        onAdmire={() => setShowOverlay(false)}
      />
    )}
  </>
  )
}

function LightsOutBoard({
  medals,
  onSolve,
}: {
  medals: Set<SliderLevel>
  onSolve: (level: SliderLevel) => void
}) {
  const [level, setLevel] = useState<SliderLevel>('medium')
  const size = LIGHTS_OUT_SIZES[level]
  const [board, setBoard] = useState<boolean[]>(() => createLightsOutBoard(LIGHTS_OUT_SIZES.medium))
  const [moves, setMoves] = useState(0)
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayShownRef = useRef(false)

  const solved = board.every(c => !c)

  useEffect(() => {
    if (solved && !overlayShownRef.current) {
      overlayShownRef.current = true
      const t = window.setTimeout(() => setShowOverlay(true), 380)
      return () => window.clearTimeout(t)
    }
    if (!solved) { overlayShownRef.current = false; setShowOverlay(false) }
  }, [solved])

  function newBoard() {
    setBoard(createLightsOutBoard(size)); setMoves(0); setShowOverlay(false)
  }

  function switchLevel(nextLevel: SliderLevel) {
    setLevel(nextLevel)
    setBoard(createLightsOutBoard(LIGHTS_OUT_SIZES[nextLevel]))
    setMoves(0)
    setShowOverlay(false)
  }

  function handlePress(r: number, c: number) {
    if (solved) return
    const next = toggleCell(board, r, c, size)
    setBoard(next)
    setMoves(m => m + 1)
    if (next.every(cell => !cell)) {
      onSolve(level)
    }
  }

  return (
  <>
    <BonusGameLayout
      board={
        <div
          className="grid h-full w-full gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {board.map((isOn, idx) => {
            const r = Math.floor(idx / size), c = idx % size
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handlePress(r, c)}
                aria-label={`Toggle light ${r + 1}, ${c + 1}`}
                className={`aspect-square rounded-full border transition duration-150 ${
                  isOn
                    ? 'border-[#d6eef3] bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.92),0_0_20px_rgba(115,221,221,0.22)]'
                    : 'border-teal-300 bg-[var(--color-accent)] shadow-[inset_0_2px_0_rgba(255,255,255,0.18),0_0_0_3px_rgba(14,165,160,0.16)]'
                } ${solved ? 'cursor-default' : 'hover:scale-105 active:scale-95'}`}
              />
            )
          })}
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-2.5">
          <div className="hidden flex-shrink-0 lg:block">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Lights Out
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Turn every light off.
            </h2>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {LIGHTS_OUT_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {LIGHTS_OUT_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-shrink-0 gap-2 lg:hidden">
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Moves</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{moves}</div>
            </div>
            <button
              type="button"
              onClick={newBoard}
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white py-2.5 transition active:bg-slate-50"
            >
              <div className="text-sm font-bold leading-none text-[var(--color-text)]">New Board</div>
            </button>
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white py-2.5 text-xs font-semibold text-[var(--color-muted)] transition active:bg-slate-50"
            >
              How to play
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">?</span>
            </button>
          </div>
          <div className="hidden flex-shrink-0 grid-cols-2 gap-3 lg:grid">
            <BonusStatTile label="Moves" value={moves} />
            <button
              type="button"
              onClick={newBoard}
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="text-[clamp(1.15rem,1.55vw,1.55rem)] font-bold leading-none text-[var(--color-text)]">
                New Board
              </div>
            </button>
          </div>

          {solved && (
            <div className="flex-shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              🎉 {LIGHTS_OUT_MEDALS[level]} {LIGHTS_OUT_LABELS[level]} solved!
            </div>
          )}

          <div className="hidden lg:flex lg:flex-col lg:gap-2.5">
            <BonusInfoCard label="Goal">
              Make every circle go dark. When the whole board is dark, you've solved the puzzle and earned the medal for that difficulty.
            </BonusInfoCard>
            <BonusInfoCard label="How It Works">
              Clicking a circle flips that circle and its up, down, left, and right neighbors. Plan a few moves ahead because every click affects a cluster.
            </BonusInfoCard>
          </div>
          {howToPlayOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setHowToPlayOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
                  <button
                    type="button"
                    onClick={() => setHowToPlayOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted)] transition hover:bg-slate-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <BonusInfoCard label="Goal">
                    Make every circle go dark. When the whole board is dark, you've solved the puzzle and earned the medal for that difficulty.
                  </BonusInfoCard>
                  <BonusInfoCard label="How It Works">
                    Clicking a circle flips that circle and its up, down, left, and right neighbors. Plan a few moves ahead because every click affects a cluster.
                  </BonusInfoCard>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToPlayOpen(false)}
                  className="mt-1 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:brightness-105"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
    {showOverlay && (
      <SolvedOverlay
        emoji="💡"
        title="Lights out!"
        subtitle={`${moves} move${moves !== 1 ? 's' : ''}`}
        medal={medals.has(level) ? undefined : `${LIGHTS_OUT_MEDALS[level]} New medal earned!`}
        onNewPuzzle={newBoard}
        onAdmire={() => setShowOverlay(false)}
      />
    )}
  </>
  )
}

function NetwalkBoard({
  medals,
  onSolve,
}: {
  medals: Set<NetwalkLevel>
  onSolve: (level: NetwalkLevel) => void
}) {
  const [level, setLevel] = useState<NetwalkLevel>('medium')
  const size = NETWALK_SIZES[level]
  const [board, setBoard] = useState<NetwalkCell[]>(() => createNetwalkBoard(NETWALK_SIZES['medium']))
  const [moves, setMoves] = useState(0)
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayShownRef = useRef(false)
  const pendingTap = useRef<{ index: number; timer: number } | null>(null)
  const solvedAwardedRef = useRef(false)
  const status = getNetwalkStatus(board, size)

  useEffect(() => {
    if (status.solved && !overlayShownRef.current) {
      overlayShownRef.current = true
      const t = window.setTimeout(() => setShowOverlay(true), 380)
      return () => window.clearTimeout(t)
    }
    if (!status.solved) { overlayShownRef.current = false; setShowOverlay(false) }
  }, [status.solved])

  function newBoard() {
    setBoard(createNetwalkBoard(size)); setMoves(0); solvedAwardedRef.current = false; setShowOverlay(false)
  }

  function switchLevel(l: NetwalkLevel) {
    setLevel(l)
    setBoard(createNetwalkBoard(NETWALK_SIZES[l]))
    setMoves(0)
    solvedAwardedRef.current = false
    setShowOverlay(false)
    if (pendingTap.current) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
    }
  }

  // Detect solve
  useEffect(() => {
    if (!status.solved) { solvedAwardedRef.current = false; return }
    if (!solvedAwardedRef.current) {
      solvedAwardedRef.current = true
      onSolve(level)
    }
  }, [status.solved, level, onSolve])

  function rotateCell(index: number, amount: number) {
    setBoard(prev =>
      prev.map((cell, i) =>
        i === index ? { ...cell, rotation: ((cell.rotation + amount) % 4 + 4) % 4 } : cell
      )
    )
    setMoves(m => m + 1)
  }

  function handleTilePress(index: number) {
    if (status.solved) return
    if (pendingTap.current && pendingTap.current.index === index) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
      rotateCell(index, -1)
      return
    }
    if (pendingTap.current) {
      window.clearTimeout(pendingTap.current.timer)
      pendingTap.current = null
    }
    const timer = window.setTimeout(() => {
      rotateCell(index, 1)
      pendingTap.current = null
    }, 220)
    pendingTap.current = { index, timer }
  }

  const pct = Math.round((status.connectedCount / board.length) * 100)

  return (
  <>
    <BonusGameLayout
      board={
        <div
          className="grid h-full w-full overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gap: '1px',
            background: 'var(--color-border)',
            border: '1px solid var(--color-border)',
          }}
        >
          {board.map((cell, index) => {
            const mask = rotateMask(cell.baseMask, cell.rotation)
            const isConnected = status.connectedIndices.has(index)
            const hasN = Boolean(mask & DIR_BITS[0])
            const hasE = Boolean(mask & DIR_BITS[1])
            const hasS = Boolean(mask & DIR_BITS[2])
            const hasW = Boolean(mask & DIR_BITS[3])
            const pipe = isConnected ? '#0EA5A0' : '#CBD5E1'
            const node = isConnected ? '#0EA5A0' : '#94A3B8'

            return (
              <button
                key={`${level}-${index}`}
                type="button"
                onClick={() => handleTilePress(index)}
                className={`relative aspect-square transition-colors ${
                  status.solved ? 'cursor-default' : 'cursor-pointer hover:brightness-95'
                } ${isConnected ? 'bg-teal-50' : 'bg-white'}`}
                aria-label={`Rotate network tile ${index + 1}`}
              >
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
                  {hasN && <line x1="50" y1="50" x2="50" y2="0"   stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasE && <line x1="50" y1="50" x2="100" y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasS && <line x1="50" y1="50" x2="50" y2="100" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {hasW && <line x1="50" y1="50" x2="0"   y2="50" stroke={pipe} strokeWidth="20" strokeLinecap="butt" />}
                  {cell.isServer ? (
                    <g>
                      <rect x="27" y="29" width="46" height="42" rx="7" fill={node} />
                      <rect x="33" y="37" width="28" height="7" rx="2" fill="white" opacity="0.95" />
                      <rect x="33" y="49" width="28" height="7" rx="2" fill="white" opacity="0.95" />
                      <circle cx="65" cy="40.5" r="2.5" fill={node} />
                      <circle cx="65" cy="52.5" r="2.5" fill={node} />
                    </g>
                  ) : (
                    <circle cx="50" cy="50" r="11" fill={node} />
                  )}
                </svg>
              </button>
            )
          })}
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden lg:gap-2.5">
          <div className="hidden flex-shrink-0 lg:block">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Netwalk
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Restore the network.
            </h2>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as NetwalkLevel[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {NETWALK_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {NETWALK_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-shrink-0 gap-2 lg:hidden">
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Moves</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{moves}</div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Connected</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{status.connectedCount}/{board.length}</div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <button
              type="button"
              onClick={newBoard}
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white py-2.5 transition active:bg-slate-50"
            >
              <div className="text-sm font-bold leading-none text-[var(--color-text)]">New Board</div>
            </button>
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white py-2.5 text-xs font-semibold text-[var(--color-muted)] transition active:bg-slate-50"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">?</span>
            </button>
          </div>
          <div className="hidden flex-shrink-0 grid-cols-2 gap-3 lg:grid">
            <BonusStatTile label="Moves" value={moves} />
            <BonusStatTile label="Connected" value={`${status.connectedCount}/${board.length}`} />
          </div>
          <div className="hidden flex-shrink-0 flex-col gap-3 lg:flex">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="h-2 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="truncate text-xs font-medium text-[var(--color-text)] lg:text-sm">
                {status.connectedCount} / {board.length} connected
              </p>
            </div>
            <button
              type="button"
              onClick={newBoard}
              className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="text-[clamp(1.15rem,1.55vw,1.55rem)] font-bold leading-none text-[var(--color-text)]">
                New Board
              </div>
            </button>
          </div>
          {status.solved && (
            <div className="flex-shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              🎉 {NETWALK_MEDALS[level]} {NETWALK_LABELS[level]} restored!
            </div>
          )}
          <div className="hidden lg:flex lg:flex-col lg:gap-2.5">
            <BonusInfoCard label="Goal">
              Rotate the pieces until every terminal is connected to the server and there are no loose wire ends anywhere in the network.
            </BonusInfoCard>
            <BonusInfoCard label="How It Works">
              Click once to rotate a tile clockwise. Double-click the same tile to rotate it counter-clockwise.
            </BonusInfoCard>
          </div>
          {howToPlayOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setHowToPlayOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
                  <button
                    type="button"
                    onClick={() => setHowToPlayOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted)] transition hover:bg-slate-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <BonusInfoCard label="Goal">
                    Rotate the pieces until every terminal is connected to the server and there are no loose wire ends anywhere in the network.
                  </BonusInfoCard>
                  <BonusInfoCard label="How It Works">
                    Click once to rotate a tile clockwise. Double-click the same tile to rotate it counter-clockwise.
                  </BonusInfoCard>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToPlayOpen(false)}
                  className="mt-1 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:brightness-105"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
    {showOverlay && (
      <SolvedOverlay
        emoji="🌐"
        title="Network restored!"
        subtitle={`${moves} move${moves !== 1 ? 's' : ''}`}
        medal={medals.has(level) ? undefined : `${NETWALK_MEDALS[level]} New medal earned!`}
        onNewPuzzle={newBoard}
        onAdmire={() => setShowOverlay(false)}
      />
    )}
  </>
  )
}

function Puzzle2048Board({
  medals,
  onAwardMedal,
}: {
  medals: Set<Game2048Medal>
  onAwardMedal: (medal: Game2048Medal) => void
}) {
  const [board, setBoard] = useState<number[]>(() => create2048Board())
  const [score, setScore] = useState(0)
  const [bestTile, setBestTile] = useState(4)
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayShownRef = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const won = bestTile >= 2048
  const stuck = !canMove2048(board)

  useEffect(() => {
    if (won && !overlayShownRef.current) {
      overlayShownRef.current = true
      const t = window.setTimeout(() => setShowOverlay(true), 380)
      return () => window.clearTimeout(t)
    }
    if (!won) { overlayShownRef.current = false; setShowOverlay(false) }
  }, [won])

  function handleMove(direction: Direction2048) {
    if (stuck) return
    const result = move2048(board, direction)
    if (!result.moved) return
    setBoard(result.board)
    setScore(current => current + result.scoreGain)
    const nextBest = Math.max(bestTile, ...result.board)
    setBestTile(nextBest)
    if (nextBest >= GAME_2048_MEDALS.gold.threshold) onAwardMedal('gold')
    else if (nextBest >= GAME_2048_MEDALS.silver.threshold) onAwardMedal('silver')
    else if (nextBest >= GAME_2048_MEDALS.bronze.threshold) onAwardMedal('bronze')
  }

  function handleReset() {
    const next = create2048Board()
    setBoard(next)
    setScore(0)
    setBestTile(Math.max(...next))
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const keyMap: Record<string, Direction2048> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const direction = keyMap[event.key]
      if (!direction) return
      event.preventDefault()
      handleMove(direction)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const colorClasses: Record<number, string> = {
    0: 'bg-white/45 text-transparent',
    2: 'bg-[#f5f6ff] text-slate-700',
    4: 'bg-[#e8f7f5] text-teal-700',
    8: 'bg-[#d7f5ef] text-teal-800',
    16: 'bg-[#c6efe8] text-teal-900',
    32: 'bg-[#ffe2ba] text-orange-900',
    64: 'bg-[#ffd19d] text-orange-900',
    128: 'bg-[#ffc37f] text-orange-950',
    256: 'bg-[#ffb560] text-orange-950',
    512: 'bg-[#ffa43f] text-white',
    1024: 'bg-[#f58e2b] text-white',
    2048: 'bg-[#f3c84b] text-slate-900',
  }

  return (
  <>
    <BonusGameLayout
      board={
        <div
          className="h-full w-full rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-inner"
          onTouchStart={(event) => {
            const touch = event.touches[0]
            if (!touch) return
            touchStart.current = { x: touch.clientX, y: touch.clientY }
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current
            const touch = event.changedTouches[0]
            touchStart.current = null
            if (!start || !touch) return
            const dx = touch.clientX - start.x
            const dy = touch.clientY - start.y
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
            handleMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
          }}
        >
          <div className="grid h-full grid-cols-4 gap-2">
            {board.map((value, index) => (
              <button
                key={`2048-${index}`}
                type="button"
                onClick={() => {}}
                className={`aspect-square rounded-2xl border border-white/50 text-lg font-bold shadow-sm transition-colors sm:text-xl ${
                  colorClasses[value] ?? 'bg-[#f28f3b] text-white'
                }`}
              >
                {value === 0 ? '' : value}
              </button>
            ))}
          </div>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-2.5">
          <div className="hidden flex-shrink-0 lg:block">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              2048
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              Merge your way upward.
            </h2>
          </div>
          <div className="flex flex-shrink-0 gap-2 lg:hidden">
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Score</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{score}</div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Best</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{bestTile}</div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 transition hover:bg-slate-50"
            >
              <div className="text-sm font-bold text-[var(--color-text)]">New Board</div>
            </button>
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="flex flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 text-[var(--color-accent)] transition hover:bg-slate-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-xs font-bold">?</span>
            </button>
          </div>
          <div className="hidden flex-shrink-0 grid-cols-2 gap-3 lg:grid">
            <BonusStatTile label="Score" value={score} />
            <BonusStatTile label="Best" value={bestTile} />
          </div>
          <div className="hidden flex-shrink-0 flex-wrap gap-2 lg:flex">
            {(['left', 'up', 'down', 'right'] as Direction2048[]).map(direction => (
              <button
                key={direction}
                type="button"
                onClick={() => handleMove(direction)}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold uppercase text-[var(--color-text)] transition hover:bg-slate-50 lg:text-sm"
              >
                {direction === 'left' ? '←' : direction === 'right' ? '→' : direction === 'up' ? '↑' : '↓'}
              </button>
            ))}
          </div>
          {(stuck || bestTile >= GAME_2048_MEDALS.bronze.threshold) && (
            <div className={`flex-shrink-0 rounded-2xl px-4 py-3 text-sm font-medium ${
              stuck
                ? 'border border-amber-200 bg-amber-50 text-amber-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {stuck
                ? 'No more moves. Start a new board and try another run.'
                : bestTile >= GAME_2048_MEDALS.gold.threshold
                  ? `🎉 ${GAME_2048_MEDALS.gold.emoji} Gold earned at 2048!`
                  : won
                    ? `🎉 ${GAME_2048_MEDALS.silver.emoji} Silver earned at 1024!`
                    : `🎉 ${GAME_2048_MEDALS.bronze.emoji} Bronze earned at 512!`}
            </div>
          )}
          <div className="hidden flex-shrink-0 lg:block">
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="text-[clamp(1.15rem,1.55vw,1.55rem)] font-bold leading-none text-[var(--color-text)]">
                New Board
              </div>
            </button>
          </div>
          <div className="hidden lg:flex lg:flex-col lg:gap-2.5">
            <BonusInfoCard label="Goal">
              Combine equal tiles to build larger values. Reach <strong>512</strong> for bronze, <strong>1024</strong> for silver, and <strong>2048</strong> for gold.
            </BonusInfoCard>
            <BonusInfoCard label="How It Works">
              Swipe or use the arrow buttons to slide all tiles at once. Matching numbers merge when they collide.
            </BonusInfoCard>
          </div>
          {howToPlayOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setHowToPlayOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
                  <button
                    type="button"
                    onClick={() => setHowToPlayOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <BonusInfoCard label="Goal">
                    Combine equal tiles to build larger values. Reach <strong>512</strong> for bronze, <strong>1024</strong> for silver, and <strong>2048</strong> for gold.
                  </BonusInfoCard>
                  <BonusInfoCard label="How It Works">
                    Swipe or use the arrow buttons to slide all tiles at once. Matching numbers merge when they collide.
                  </BonusInfoCard>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToPlayOpen(false)}
                  className="mt-1 w-full rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
    {showOverlay && (
      <SolvedOverlay
        emoji="🏆"
        title="2048 reached!"
        subtitle={`Score: ${score}`}
        medal={medals.has('gold') ? undefined : `${GAME_2048_MEDALS.gold.emoji} New medal earned!`}
        onNewPuzzle={() => { handleReset(); setShowOverlay(false) }}
        onAdmire={() => setShowOverlay(false)}
      />
    )}
  </>
  )
}

// ---------- star battle ----------

function sbAdjacent(a: number, b: number, size: number) {
  const ar = Math.floor(a / size), ac = a % size
  const br = Math.floor(b / size), bc = b % size
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1
}

function sbIsValid(stars: number[], size: number, regions: number[]) {
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      if (sbAdjacent(stars[i], stars[j], size)) return false
    }
  }
  const rowCounts = Array<number>(size).fill(0)
  const colCounts = Array<number>(size).fill(0)
  const regionCounts: Record<number, number> = {}
  for (const s of stars) {
    const r = Math.floor(s / size), c = s % size
    rowCounts[r]++
    colCounts[c]++
    regionCounts[regions[s]] = (regionCounts[regions[s]] ?? 0) + 1
    if (rowCounts[r] > 2 || colCounts[c] > 2) return false
    if (regionCounts[regions[s]] > 2) return false
  }
  return true
}

function sbIsSolved(stars: number[], puzzle: StarBattlePuzzle) {
  const { size, regions } = puzzle
  if (stars.length !== size * 2) return false
  if (!sbIsValid(stars, size, regions)) return false
  const rowCounts = Array<number>(size).fill(0)
  const colCounts = Array<number>(size).fill(0)
  const regionCounts: Record<number, number> = {}
  for (const s of stars) {
    rowCounts[Math.floor(s / size)]++
    colCounts[s % size]++
    regionCounts[regions[s]] = (regionCounts[regions[s]] ?? 0) + 1
  }
  const numRegions = new Set(regions).size
  return (
    rowCounts.every(c => c === 2) &&
    colCounts.every(c => c === 2) &&
    Object.keys(regionCounts).length === numRegions &&
    Object.values(regionCounts).every(c => c === 2)
  )
}

// Cell state: 0 = empty, 1 = star, 2 = X marker
function StarBattleBoard({
  medals,
  solvedBoards,
  onSolve,
}: {
  medals: Set<StarBattleLevel>
  solvedBoards: Record<StarBattleLevel, Set<number>>
  onSolve: (level: StarBattleLevel, puzzleIdx: number) => void
}) {
  const [level, setLevel] = useState<StarBattleLevel>('easy')
  const [puzzleIdx, setPuzzleIdx] = useState(0)
  const [cells, setCells] = useState<number[]>(() => Array(SB_PUZZLES['easy'][0].size ** 2).fill(0))
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [sbPickerOpen, setSbPickerOpen] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const solvedRef = useRef(false)
  const overlayShownRef = useRef(false)

  const puzzle = SB_PUZZLES[level][puzzleIdx % SB_PUZZLES[level].length]
  const { size, regions } = puzzle

  const stars = cells.reduce<number[]>((acc, v, i) => { if (v === 1) acc.push(i); return acc }, [])
  const solved = sbIsSolved(stars, puzzle)

  useEffect(() => {
    if (solved && !solvedRef.current) {
      solvedRef.current = true
      onSolve(level, puzzleIdx)
    }
    if (!solved) solvedRef.current = false
  }, [solved, level, puzzleIdx, onSolve])

  useEffect(() => {
    if (solved && !overlayShownRef.current) {
      overlayShownRef.current = true
      const t = window.setTimeout(() => setShowOverlay(true), 380)
      return () => window.clearTimeout(t)
    }
    if (!solved) { overlayShownRef.current = false; setShowOverlay(false) }
  }, [solved])

  function switchLevel(l: StarBattleLevel) {
    setLevel(l)
    setPuzzleIdx(0)
    setCells(Array(SB_PUZZLES[l][0].size ** 2).fill(0))
    solvedRef.current = false
    setShowOverlay(false)
  }

  function selectPuzzle(idx: number) {
    setPuzzleIdx(idx)
    setCells(Array(SB_PUZZLES[level][idx].size ** 2).fill(0))
    solvedRef.current = false
    setShowOverlay(false)
  }

  function handleCell(idx: number) {
    if (solved) return
    setCells(prev => {
      const next = [...prev]
      next[idx] = next[idx] === 0 ? 2 : next[idx] === 2 ? 1 : 0
      return next
    })
  }

  const numStars = stars.length
  const valid = sbIsValid(stars, size, regions)

  return (
  <>
    <BonusGameLayout
      board={
        <div className="h-full w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
          <div
            className="grid h-full w-full"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {cells.map((state, idx) => {
              const region = regions[idx]
              const row = Math.floor(idx / size)
              const col = idx % size
              const rightNeighbor = col < size - 1 ? regions[idx + 1] : -1
              const bottomNeighbor = row < size - 1 ? regions[idx + size] : -1
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleCell(idx)}
                  aria-label={`Cell ${row + 1},${col + 1}`}
                  className="relative flex items-center justify-center overflow-hidden transition-colors duration-100"
                  style={{
                    background: SB_REGION_COLORS[region % SB_REGION_COLORS.length],
                    borderRight: rightNeighbor !== region ? '2px solid rgba(0,0,0,0.25)' : '1px solid rgba(0,0,0,0.08)',
                    borderBottom: bottomNeighbor !== region ? '2px solid rgba(0,0,0,0.25)' : '1px solid rgba(0,0,0,0.08)',
                    borderTop: row === 0 ? '2px solid rgba(0,0,0,0.25)' : undefined,
                    borderLeft: col === 0 ? '2px solid rgba(0,0,0,0.25)' : undefined,
                  }}
                >
                  {state === 1 && (
                    <span className="select-none text-[clamp(1rem,3vw,2rem)] leading-none drop-shadow-sm">⭐</span>
                  )}
                  {state === 2 && (
                    <span className="select-none text-[clamp(0.8rem,2.2vw,1.4rem)] font-bold leading-none text-slate-400">✕</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden lg:gap-2.5">
          {/* Fixed top: title + difficulty buttons */}
          <div className="hidden flex-shrink-0 lg:block">
            <p className="text-[clamp(1.45rem,1.9vw,2.25rem)] font-bold leading-[1.05] text-[var(--color-text)]">
              Star Battle
            </p>
            <h2 className="mt-2 text-[clamp(1rem,1.2vw,1.24rem)] font-medium leading-[1.28] text-[var(--color-muted)]">
              2 stars per row, column &amp; region.
            </h2>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {(['easy', 'medium', 'hard'] as StarBattleLevel[]).filter(l => SB_PUZZLES[l].length > 0).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLevel(l)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition lg:text-sm ${
                  level === l
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {STAR_BATTLE_LABELS[l]}
                <span className={`leading-none transition-opacity ${medals.has(l) ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {STAR_BATTLE_MEDALS[l]}
                </span>
              </button>
            ))}
          </div>

          {/* Mobile-only: stars counter + puzzle picker button + how to play */}
          <div className="flex flex-shrink-0 gap-2 lg:hidden">
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Stars</div>
              <div className="text-lg font-bold leading-none text-[var(--color-text)]">{numStars}/{size * 2}</div>
            </div>
            <button
              type="button"
              onClick={() => setSbPickerOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-slate-50"
            >
              #{puzzleIdx + 1}
              <span className="text-[10px] text-[var(--color-accent)]">▾</span>
            </button>
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--color-border)] bg-white px-2 py-2.5 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-slate-50"
            >
              How to play
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[10px] font-bold text-[var(--color-accent)]">?</span>
            </button>
          </div>

          {/* Desktop: scrollable area with stats, puzzle grid, messages, info */}
          <div className="hidden min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto lg:flex">
            <BonusStatTile label="Stars" value={`${numStars}/${size * 2}`} />
            <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Puzzle</div>
              <div className="grid grid-cols-5 gap-1.5">
                {SB_PUZZLES[level].map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectPuzzle(i)}
                    className={`flex h-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                      puzzleIdx === i
                        ? 'bg-[var(--color-accent)] text-white shadow-sm'
                        : solvedBoards[level].has(i)
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-slate-50'
                    }`}
                  >
                    {solvedBoards[level].has(i) ? '✓' : i + 1}
                  </button>
                ))}
              </div>
            </div>
            {numStars === size * 2 && !solved && !valid && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                A rule is violated — stars can&apos;t touch, and each row, column, and region needs exactly 2.
              </div>
            )}
            <BonusInfoCard label="Goal">
              Place exactly <strong>2 stars</strong> in every row, every column, and every colored region. Stars cannot touch each other — not even diagonally.
            </BonusInfoCard>
            <BonusInfoCard label="How It Works">
              Click once to mark a cell ✕ (a reminder it can&apos;t hold a star), click again to place a ⭐, click a third time to clear it.
            </BonusInfoCard>
          </div>

          {/* Mobile-only: error message */}
          {numStars === size * 2 && !solved && !valid && (
            <div className="flex-shrink-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 lg:hidden">
              A rule is violated — stars can&apos;t touch, and each row, column, and region needs exactly 2.
            </div>
          )}

          {/* Mobile picker drawer */}
          {sbPickerOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setSbPickerOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col rounded-t-3xl bg-white px-4 pb-8 pt-5 shadow-xl max-h-[85dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Select Puzzle</p>
                  <button
                    type="button"
                    onClick={() => setSbPickerOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted)] transition hover:bg-slate-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-2 mb-4">
                  {(['easy', 'medium', 'hard'] as StarBattleLevel[]).filter(l => SB_PUZZLES[l].length > 0).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => switchLevel(l)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        level === l
                          ? 'bg-[var(--color-accent)] text-white shadow-sm'
                          : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                      }`}
                    >
                      {STAR_BATTLE_LABELS[l]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {SB_PUZZLES[level].map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { selectPuzzle(i); setSbPickerOpen(false) }}
                      className={`flex h-10 items-center justify-center rounded-xl text-sm font-bold transition ${
                        puzzleIdx === i
                          ? 'bg-[var(--color-accent)] text-white shadow-sm'
                          : solvedBoards[level].has(i)
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-slate-50'
                      }`}
                    >
                      {solvedBoards[level].has(i) ? '✓' : i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mobile how-to-play drawer */}
          {howToPlayOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
              onClick={() => setHowToPlayOpen(false)}
            >
              <div
                className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-white px-5 pb-8 pt-5 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-text)]">How to Play</p>
                  <button
                    type="button"
                    onClick={() => setHowToPlayOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <BonusInfoCard label="Goal">
                    Place exactly <strong>2 stars</strong> in every row, every column, and every colored region. Stars cannot touch — not even diagonally.
                  </BonusInfoCard>
                  <BonusInfoCard label="How It Works">
                    Tap once to mark ✕, tap again to place a ⭐, tap a third time to clear.
                  </BonusInfoCard>
                </div>
                <button
                  type="button"
                  onClick={() => setHowToPlayOpen(false)}
                  className="mt-1 w-full rounded-2xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      }
    />
    {showOverlay && (
      <SolvedOverlay
        emoji="⭐"
        title="Puzzle solved!"
        subtitle={`${STAR_BATTLE_LABELS[level]} #${puzzleIdx + 1}`}
        medal={medals.has(level) ? undefined : `${STAR_BATTLE_MEDALS[level]} New medal earned!`}
        onNewPuzzle={() => selectPuzzle((puzzleIdx + 1) % SB_PUZZLES[level].length)}
        onAdmire={() => setShowOverlay(false)}
      />
    )}
  </>
  )
}

// ---------- puzzle registry ----------

const PUZZLE_LIST = [
  {
    id: 'slider',
    name: 'Slider Puzzle',
    emoji: '🔢',
    desc: 'Arrange tiles 1–15 in order',
    live: true,
  },
  {
    id: 'lightsout',
    name: 'Lights Out',
    emoji: '💡',
    desc: 'Toggle cells to turn every light off',
    live: true,
  },
  {
    id: 'netwalk',
    name: 'Netwalk',
    emoji: '🌐',
    desc: 'Rotate pipes to restore the network',
    live: true,
  },
  {
    id: '2048',
    name: '2048',
    emoji: '🔲',
    desc: 'Merge matching tiles to reach 2048',
    live: true,
  },
  {
    id: 'queens',
    name: 'Queens',
    emoji: '👑',
    desc: 'One queen per row, column & color region',
    live: true,
  },
  {
    id: 'starbattle',
    name: 'Star Battle',
    emoji: '⭐',
    desc: 'Place 2 stars in every row, column & region',
    live: true,
  },
]

const LIVE_PUZZLES = PUZZLE_LIST.filter(p => p.live)
const LAST_PUZZLE_KEY = 'pw-last-puzzle'

type BonusMedalState = {
  slider: Set<SliderLevel>
  lightsOut: Set<SliderLevel>
  netwalk: Set<NetwalkLevel>
  game2048: Set<Game2048Medal>
  queens: Set<QueensLevel>
  starBattle: Set<StarBattleLevel>
}

type QueensSolvedBoardState = Record<QueensLevel, Set<number>>
type StarBattleSolvedBoardState = Record<StarBattleLevel, Set<number>>

function createEmptyBonusMedalState(): BonusMedalState {
  return {
    slider: new Set(),
    lightsOut: new Set(),
    netwalk: new Set(),
    game2048: new Set(),
    queens: new Set(),
    starBattle: new Set(),
  }
}

function createEmptyQueensSolvedBoardState(): QueensSolvedBoardState {
  return {
    easy: new Set(),
    medium: new Set(),
    hard: new Set(),
  }
}

function createEmptyStarBattleSolvedBoardState(): StarBattleSolvedBoardState {
  return { easy: new Set(), medium: new Set(), hard: new Set() }
}

function remapEasyQueensSolvedSet(set: Set<number>) {
  return new Set(
    [...set]
      .map(index => (
        index >= 0 && index < QUEENS_EASY_OLD_TO_NEW.length
          ? QUEENS_EASY_OLD_TO_NEW[index]
          : index
      ))
      .filter(index => Number.isInteger(index) && index >= 0),
  )
}

function remapMediumQueensSolvedSet(set: Set<number>) {
  return new Set(
    [...set]
      .map(index => (
        index >= 0 && index < QUEENS_MEDIUM_OLD_TO_NEW.length
          ? QUEENS_MEDIUM_OLD_TO_NEW[index]
          : index
      ))
      .filter(index => Number.isInteger(index) && index >= 0),
  )
}

function remapHardQueensSolvedSet(set: Set<number>) {
  return new Set(
    [...set]
      .map(index => (
        index >= 0 && index < QUEENS_HARD_OLD_TO_NEW.length
          ? QUEENS_HARD_OLD_TO_NEW[index]
          : index
      ))
      .filter(index => Number.isInteger(index) && index >= 0),
  )
}

function readStoredSet<T extends string>(key: string) {
  try {
    const stored = localStorage.getItem(key)
    return stored ? new Set(JSON.parse(stored) as T[]) : new Set<T>()
  } catch {
    return new Set<T>()
  }
}

function readLocalBonusMedalState(): BonusMedalState {
  return {
    slider: readStoredSet<SliderLevel>(SLIDER_MEDALS_KEY),
    lightsOut: readStoredSet<SliderLevel>(LIGHTS_OUT_MEDALS_KEY),
    netwalk: readStoredSet<NetwalkLevel>(NETWALK_MEDALS_KEY),
    game2048: readStoredSet<Game2048Medal>(GAME_2048_MEDALS_KEY),
    queens: readStoredSet<QueensLevel>(QUEENS_MEDALS_KEY),
    starBattle: readStoredSet<StarBattleLevel>(STAR_BATTLE_MEDALS_KEY),
  }
}

function readStoredNumberSet(key: string) {
  try {
    const stored = localStorage.getItem(key)
    const parsed = stored ? JSON.parse(stored) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value >= 0)
        : [],
    )
  } catch {
    return new Set<number>()
  }
}

function readLocalQueensSolvedBoardState(): QueensSolvedBoardState {
  const state = {
    easy: readStoredNumberSet(QUEENS_SOLVED_KEYS.easy),
    medium: readStoredNumberSet(QUEENS_SOLVED_KEYS.medium),
    hard: readStoredNumberSet(QUEENS_SOLVED_KEYS.hard),
  }
  let version = PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION
  try {
    const storedVersion = localStorage.getItem(QUEENS_SOLVED_ORDER_VERSION_KEY)
    if (storedVersion != null) {
      const parsed = Number(storedVersion)
      if (Number.isInteger(parsed) && parsed >= 1) version = parsed
    } else {
      const hasAny = state.easy.size > 0 || state.medium.size > 0 || state.hard.size > 0
      version = hasAny ? 1 : PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION
    }
  } catch {
    const hasAny = state.easy.size > 0 || state.medium.size > 0 || state.hard.size > 0
    version = hasAny ? 1 : PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION
  }
  if (version < PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION) {
    if (version < 2) {
      state.easy = remapEasyQueensSolvedSet(state.easy)
    }
    if (version < 3) {
      state.medium = remapMediumQueensSolvedSet(state.medium)
    }
    if (version < 4) {
      state.hard = remapHardQueensSolvedSet(state.hard)
    }
    writeLocalQueensSolvedBoardState(state)
  }
  return state
}

function writeLocalBonusMedalState(state: BonusMedalState) {
  try { localStorage.setItem(SLIDER_MEDALS_KEY, JSON.stringify([...state.slider])) } catch {}
  try { localStorage.setItem(LIGHTS_OUT_MEDALS_KEY, JSON.stringify([...state.lightsOut])) } catch {}
  try { localStorage.setItem(NETWALK_MEDALS_KEY, JSON.stringify([...state.netwalk])) } catch {}
  try { localStorage.setItem(GAME_2048_MEDALS_KEY, JSON.stringify([...state.game2048])) } catch {}
  try { localStorage.setItem(QUEENS_MEDALS_KEY, JSON.stringify([...state.queens])) } catch {}
  try { localStorage.setItem(STAR_BATTLE_MEDALS_KEY, JSON.stringify([...state.starBattle])) } catch {}
}

function writeLocalQueensSolvedBoardState(state: QueensSolvedBoardState) {
  try { localStorage.setItem(QUEENS_SOLVED_KEYS.easy, JSON.stringify([...state.easy].sort((a, b) => a - b))) } catch {}
  try { localStorage.setItem(QUEENS_SOLVED_KEYS.medium, JSON.stringify([...state.medium].sort((a, b) => a - b))) } catch {}
  try { localStorage.setItem(QUEENS_SOLVED_KEYS.hard, JSON.stringify([...state.hard].sort((a, b) => a - b))) } catch {}
  try { localStorage.setItem(QUEENS_SOLVED_ORDER_VERSION_KEY, String(PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION)) } catch {}
}

function readLocalStarBattleSolvedBoardState(): StarBattleSolvedBoardState {
  return {
    easy: readStoredNumberSet(STAR_BATTLE_SOLVED_KEYS.easy),
    medium: readStoredNumberSet(STAR_BATTLE_SOLVED_KEYS.medium),
    hard: readStoredNumberSet(STAR_BATTLE_SOLVED_KEYS.hard),
  }
}

function writeLocalStarBattleSolvedBoardState(state: StarBattleSolvedBoardState) {
  try { localStorage.setItem(STAR_BATTLE_SOLVED_KEYS.easy, JSON.stringify([...state.easy].sort((a, b) => a - b))) } catch {}
  try { localStorage.setItem(STAR_BATTLE_SOLVED_KEYS.medium, JSON.stringify([...state.medium].sort((a, b) => a - b))) } catch {}
  try { localStorage.setItem(STAR_BATTLE_SOLVED_KEYS.hard, JSON.stringify([...state.hard].sort((a, b) => a - b))) } catch {}
}

function bonusMedalsFromProfile(profile: PuzzleWeekBonusMedals): BonusMedalState {
  return {
    slider: new Set(profile.slider as SliderLevel[]),
    lightsOut: new Set(profile.lightsOut as SliderLevel[]),
    netwalk: new Set(profile.netwalk as NetwalkLevel[]),
    game2048: new Set(profile.game2048 as Game2048Medal[]),
    queens: new Set(profile.queens as QueensLevel[]),
    starBattle: new Set((profile.starBattle ?? []) as StarBattleLevel[]),
  }
}

function queensSolvedBoardsFromProfile(profile: PuzzleWeekBonusMedals): QueensSolvedBoardState {
  const state = {
    easy: new Set(profile.queensSolved.easy),
    medium: new Set(profile.queensSolved.medium),
    hard: new Set(profile.queensSolved.hard),
  }
  if ((profile.queensSolvedOrderVersion ?? 1) < PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION) {
    if ((profile.queensSolvedOrderVersion ?? 1) < 2) {
      state.easy = remapEasyQueensSolvedSet(state.easy)
    }
    if ((profile.queensSolvedOrderVersion ?? 1) < 3) {
      state.medium = remapMediumQueensSolvedSet(state.medium)
    }
    if ((profile.queensSolvedOrderVersion ?? 1) < 4) {
      state.hard = remapHardQueensSolvedSet(state.hard)
    }
  }
  return state
}

function queensSolvedBoardsToProfile(state: QueensSolvedBoardState): PuzzleWeekQueensSolvedBoards {
  return {
    easy: [...state.easy].sort((a, b) => a - b),
    medium: [...state.medium].sort((a, b) => a - b),
    hard: [...state.hard].sort((a, b) => a - b),
  }
}

function starBattleSolvedBoardsFromProfile(profile: PuzzleWeekBonusMedals): StarBattleSolvedBoardState {
  const sb = profile.starBattleSolved ?? { easy: [], medium: [], hard: [] }
  return {
    easy: new Set(sb.easy),
    medium: new Set(sb.medium),
    hard: new Set(sb.hard),
  }
}

function starBattleSolvedBoardsToProfile(state: StarBattleSolvedBoardState): PuzzleWeekQueensSolvedBoards {
  return {
    easy: [...state.easy].sort((a, b) => a - b),
    medium: [...state.medium].sort((a, b) => a - b),
    hard: [...state.hard].sort((a, b) => a - b),
  }
}

function bonusMedalsToProfile(state: BonusMedalState, queensSolved: QueensSolvedBoardState, starBattleSolved: StarBattleSolvedBoardState): PuzzleWeekBonusMedals {
  return {
    slider: [...state.slider],
    lightsOut: [...state.lightsOut],
    netwalk: [...state.netwalk],
    game2048: [...state.game2048],
    queens: [...state.queens],
    queensSolved: queensSolvedBoardsToProfile(queensSolved),
    queensSolvedOrderVersion: PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION,
    starBattle: [...state.starBattle],
    starBattleSolved: starBattleSolvedBoardsToProfile(starBattleSolved),
  }
}

function unionSets<T>(a: Set<T>, b: Set<T>) {
  return new Set<T>([...a, ...b])
}

function unionBonusMedalStates(a: BonusMedalState, b: BonusMedalState): BonusMedalState {
  return {
    slider: unionSets(a.slider, b.slider),
    lightsOut: unionSets(a.lightsOut, b.lightsOut),
    netwalk: unionSets(a.netwalk, b.netwalk),
    game2048: unionSets(a.game2048, b.game2048),
    queens: unionSets(a.queens, b.queens),
    starBattle: unionSets(a.starBattle, b.starBattle),
  }
}

function unionQueensSolvedBoardStates(a: QueensSolvedBoardState, b: QueensSolvedBoardState): QueensSolvedBoardState {
  return {
    easy: unionSets(a.easy, b.easy),
    medium: unionSets(a.medium, b.medium),
    hard: unionSets(a.hard, b.hard),
  }
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

function bonusMedalStatesEqual(a: BonusMedalState, b: BonusMedalState) {
  return (
    setsEqual(a.slider, b.slider) &&
    setsEqual(a.lightsOut, b.lightsOut) &&
    setsEqual(a.netwalk, b.netwalk) &&
    setsEqual(a.game2048, b.game2048) &&
    setsEqual(a.queens, b.queens) &&
    setsEqual(a.starBattle, b.starBattle)
  )
}

function queensSolvedBoardStatesEqual(a: QueensSolvedBoardState, b: QueensSolvedBoardState) {
  return (
    setsEqual(a.easy, b.easy) &&
    setsEqual(a.medium, b.medium) &&
    setsEqual(a.hard, b.hard)
  )
}

function cloneBonusMedalState(state: BonusMedalState): BonusMedalState {
  return {
    slider: new Set(state.slider),
    lightsOut: new Set(state.lightsOut),
    netwalk: new Set(state.netwalk),
    game2048: new Set(state.game2048),
    queens: new Set(state.queens),
    starBattle: new Set(state.starBattle),
  }
}

function cloneQueensSolvedBoardState(state: QueensSolvedBoardState): QueensSolvedBoardState {
  return {
    easy: new Set(state.easy),
    medium: new Set(state.medium),
    hard: new Set(state.hard),
  }
}

function unionStarBattleSolvedBoardStates(a: StarBattleSolvedBoardState, b: StarBattleSolvedBoardState): StarBattleSolvedBoardState {
  return {
    easy: unionSets(a.easy, b.easy),
    medium: unionSets(a.medium, b.medium),
    hard: unionSets(a.hard, b.hard),
  }
}

function starBattleSolvedBoardStatesEqual(a: StarBattleSolvedBoardState, b: StarBattleSolvedBoardState) {
  return setsEqual(a.easy, b.easy) && setsEqual(a.medium, b.medium) && setsEqual(a.hard, b.hard)
}

function cloneStarBattleSolvedBoardState(state: StarBattleSolvedBoardState): StarBattleSolvedBoardState {
  return { easy: new Set(state.easy), medium: new Set(state.medium), hard: new Set(state.hard) }
}

// ---------- page ----------

export function PuzzleWeekBonusHub() {
  const { user, isGuest } = useAuth()
  const canManage = canManagePuzzleWeekIdentity(user)
  const puzzleWeekEventId = CURRENT_PUZZLE_WEEK_EVENT.id

  // Disable pull-to-refresh on mobile so swipe-down gestures don't reload the page.
  // Must target both html AND body — iOS Safari only respects the html element.
  useEffect(() => {
    const prevBody = document.body.style.overscrollBehavior
    const prevHtml = document.documentElement.style.overscrollBehavior
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overscrollBehavior = prevBody
      document.documentElement.style.overscrollBehavior = prevHtml
    }
  }, [])

  const [selectedId, setSelectedId] = useState(() => {
    try {
      const stored = localStorage.getItem(LAST_PUZZLE_KEY)
      if (stored && LIVE_PUZZLES.some(p => p.id === stored)) return stored
    } catch {}
    return LIVE_PUZZLES[0].id
  })
  const [menuOpen, setMenuOpen] = useState(false)

  function selectPuzzle(id: string) {
    setSelectedId(id)
    setMenuOpen(false)
    try { localStorage.setItem(LAST_PUZZLE_KEY, id) } catch {}
  }

  const [sliderMedals, setSliderMedals] = useState<Set<SliderLevel>>(new Set())
  const [lightsOutMedals, setLightsOutMedals] = useState<Set<SliderLevel>>(new Set())
  const [game2048Medals, setGame2048Medals] = useState<Set<Game2048Medal>>(new Set())
  const [netwalkMedals, setNetwalkMedals] = useState<Set<NetwalkLevel>>(new Set())
  const [queensMedals, setQueensMedals] = useState<Set<QueensLevel>>(new Set())
  const [starBattleMedals, setStarBattleMedals] = useState<Set<StarBattleLevel>>(new Set())
  const bonusMedalStateRef = useRef<BonusMedalState>(createEmptyBonusMedalState())
  const [queensSolvedBoards, setQueensSolvedBoards] = useState<QueensSolvedBoardState>(createEmptyQueensSolvedBoardState())
  const queensSolvedBoardsRef = useRef<QueensSolvedBoardState>(createEmptyQueensSolvedBoardState())
  const [starBattleSolvedBoards, setStarBattleSolvedBoards] = useState<StarBattleSolvedBoardState>(createEmptyStarBattleSolvedBoardState())
  const starBattleSolvedBoardsRef = useRef<StarBattleSolvedBoardState>(createEmptyStarBattleSolvedBoardState())
  const queensFrameRef = useRef<HTMLIFrameElement | null>(null)

  function getCurrentBonusMedalState(): BonusMedalState {
    return {
      slider: new Set(bonusMedalStateRef.current.slider),
      lightsOut: new Set(bonusMedalStateRef.current.lightsOut),
      netwalk: new Set(bonusMedalStateRef.current.netwalk),
      game2048: new Set(bonusMedalStateRef.current.game2048),
      queens: new Set(bonusMedalStateRef.current.queens),
      starBattle: new Set(bonusMedalStateRef.current.starBattle),
    }
  }

  function getCurrentQueensSolvedBoardState(): QueensSolvedBoardState {
    return cloneQueensSolvedBoardState(queensSolvedBoardsRef.current)
  }

  function getCurrentStarBattleSolvedBoardState(): StarBattleSolvedBoardState {
    return cloneStarBattleSolvedBoardState(starBattleSolvedBoardsRef.current)
  }

  function applyBonusMedalState(next: BonusMedalState) {
    bonusMedalStateRef.current = cloneBonusMedalState(next)
    setSliderMedals(new Set(next.slider))
    setLightsOutMedals(new Set(next.lightsOut))
    setNetwalkMedals(new Set(next.netwalk))
    setGame2048Medals(new Set(next.game2048))
    setQueensMedals(new Set(next.queens))
    setStarBattleMedals(new Set(next.starBattle))
    writeLocalBonusMedalState(next)
  }

  function applyQueensSolvedBoardState(next: QueensSolvedBoardState) {
    queensSolvedBoardsRef.current = cloneQueensSolvedBoardState(next)
    setQueensSolvedBoards(cloneQueensSolvedBoardState(next))
    writeLocalQueensSolvedBoardState(next)
  }

  function applyStarBattleSolvedBoardState(next: StarBattleSolvedBoardState) {
    starBattleSolvedBoardsRef.current = cloneStarBattleSolvedBoardState(next)
    setStarBattleSolvedBoards(cloneStarBattleSolvedBoardState(next))
    writeLocalStarBattleSolvedBoardState(next)
  }

  function postQueensSync(next: QueensSolvedBoardState = getCurrentQueensSolvedBoardState()) {
    queensFrameRef.current?.contentWindow?.postMessage({
      type: 'queens-sync',
      solvedBoards: {
        ...queensSolvedBoardsToProfile(next),
        version: PUZZLE_WEEK_QUEENS_SOLVED_ORDER_VERSION,
      },
    }, '*')
  }

  function syncBonusProfile(nextMedals: BonusMedalState, nextQueensSolvedBoards: QueensSolvedBoardState, nextStarBattleSolvedBoards?: StarBattleSolvedBoardState) {
    const starBattleBoards = nextStarBattleSolvedBoards ?? getCurrentStarBattleSolvedBoardState()
    applyBonusMedalState(nextMedals)
    applyQueensSolvedBoardState(nextQueensSolvedBoards)
    applyStarBattleSolvedBoardState(starBattleBoards)
    postQueensSync(nextQueensSolvedBoards)
    if (user && !isGuest) {
      void savePuzzleWeekBonusMedals(
        puzzleWeekEventId,
        user,
        bonusMedalsToProfile(nextMedals, nextQueensSolvedBoards, starBattleBoards),
      ).catch(() => {})
    }
  }

  useEffect(() => {
    const localState = readLocalBonusMedalState()
    applyBonusMedalState(localState)
    const localQueensState = readLocalQueensSolvedBoardState()
    applyQueensSolvedBoardState(localQueensState)
    const localStarBattleState = readLocalStarBattleSolvedBoardState()
    applyStarBattleSolvedBoardState(localStarBattleState)

    if (!user || isGuest) return

    let cancelled = false
    void (async () => {
      try {
        const remoteProfile = await getPuzzleWeekBonusMedals(puzzleWeekEventId, user)
        if (cancelled) return
        const remoteState = bonusMedalsFromProfile(remoteProfile)
        const remoteQueensState = queensSolvedBoardsFromProfile(remoteProfile)
        const remoteStarBattleState = starBattleSolvedBoardsFromProfile(remoteProfile)
        const mergedState = unionBonusMedalStates(getCurrentBonusMedalState(), remoteState)
        const mergedQueensState = unionQueensSolvedBoardStates(getCurrentQueensSolvedBoardState(), remoteQueensState)
        const mergedStarBattleState = unionStarBattleSolvedBoardStates(getCurrentStarBattleSolvedBoardState(), remoteStarBattleState)
        applyBonusMedalState(mergedState)
        applyQueensSolvedBoardState(mergedQueensState)
        applyStarBattleSolvedBoardState(mergedStarBattleState)
        if (
          !bonusMedalStatesEqual(remoteState, mergedState) ||
          !queensSolvedBoardStatesEqual(remoteQueensState, mergedQueensState) ||
          !starBattleSolvedBoardStatesEqual(remoteStarBattleState, mergedStarBattleState)
        ) {
          await savePuzzleWeekBonusMedals(
            puzzleWeekEventId,
            user,
            bonusMedalsToProfile(mergedState, mergedQueensState, mergedStarBattleState),
          )
        }
      } catch {
        // Keep local medals if the account sync fails.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, isGuest, puzzleWeekEventId])

  function awardSliderMedal(level: SliderLevel) {
    const current = getCurrentBonusMedalState()
    if (current.slider.has(level)) return
    const next = { ...current, slider: new Set(current.slider).add(level) }
    syncBonusProfile(next, getCurrentQueensSolvedBoardState())
  }

  function awardLightsOutMedal(level: SliderLevel) {
    const current = getCurrentBonusMedalState()
    if (current.lightsOut.has(level)) return
    const next = { ...current, lightsOut: new Set(current.lightsOut).add(level) }
    syncBonusProfile(next, getCurrentQueensSolvedBoardState())
  }

  function awardNetwalkMedal(level: NetwalkLevel) {
    const current = getCurrentBonusMedalState()
    if (current.netwalk.has(level)) return
    const next = { ...current, netwalk: new Set(current.netwalk).add(level) }
    syncBonusProfile(next, getCurrentQueensSolvedBoardState())
  }

  function award2048Medal(medal: Game2048Medal) {
    const current = getCurrentBonusMedalState()
    if (current.game2048.has(medal)) return
    const next = { ...current, game2048: new Set(current.game2048).add(medal) }
    syncBonusProfile(next, getCurrentQueensSolvedBoardState())
  }

  function awardQueensMedal(level: QueensLevel) {
    const current = getCurrentBonusMedalState()
    if (current.queens.has(level)) return
    const next = { ...current, queens: new Set(current.queens).add(level) }
    syncBonusProfile(next, getCurrentQueensSolvedBoardState())
  }

  function awardStarBattleMedal(level: StarBattleLevel, puzzleIdx: number) {
    const current = getCurrentBonusMedalState()
    const currentBoards = getCurrentStarBattleSolvedBoardState()
    const hasMedal = current.starBattle.has(level)
    const hasPuzzle = currentBoards[level].has(puzzleIdx)
    if (hasMedal && hasPuzzle) return
    const nextMedals = hasMedal ? current : { ...current, starBattle: new Set(current.starBattle).add(level) }
    const nextBoards = cloneStarBattleSolvedBoardState(currentBoards)
    if (!hasPuzzle) nextBoards[level].add(puzzleIdx)
    syncBonusProfile(nextMedals, getCurrentQueensSolvedBoardState(), nextBoards)
  }

  // Listen for solve messages posted by the Queens iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'queens-request-sync') {
        postQueensSync()
        return
      }
      if (e.data?.type === 'queens-solved-board' && e.data?.difficulty && Number.isInteger(e.data?.index)) {
        const difficulty = e.data.difficulty as QueensLevel
        const index = Number(e.data.index)
        if (!['easy', 'medium', 'hard'].includes(difficulty) || index < 0) return
        const currentBoards = getCurrentQueensSolvedBoardState()
        if (currentBoards[difficulty].has(index)) return
        const nextBoards = cloneQueensSolvedBoardState(currentBoards)
        nextBoards[difficulty].add(index)
        syncBonusProfile(getCurrentBonusMedalState(), nextBoards)
        return
      }
      if (e.data?.type === 'queens-solved' && e.data?.difficulty) {
        awardQueensMedal(e.data.difficulty as QueensLevel)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [user, isGuest, puzzleWeekEventId])

  useEffect(() => {
    if (selectedId === 'queens') {
      postQueensSync(queensSolvedBoards)
    }
  }, [selectedId, queensSolvedBoards])

  function renderGame() {
    switch (selectedId) {
      case 'slider':    return <SliderPuzzleBoard medals={sliderMedals} onSolve={awardSliderMedal} />
      case 'lightsout': return <LightsOutBoard medals={lightsOutMedals} onSolve={awardLightsOutMedal} />
      case 'netwalk':   return <NetwalkBoard medals={netwalkMedals} onSolve={awardNetwalkMedal} />
      case '2048':      return <Puzzle2048Board medals={game2048Medals} onAwardMedal={award2048Medal} />
      case 'queens':    return (
        <iframe
          ref={queensFrameRef}
          src="/queens.html"
          className="h-full w-full border-0"
          title="Queens Puzzle"
          onLoad={() => postQueensSync()}
        />
      )
      case 'starbattle': return <StarBattleBoard medals={starBattleMedals} solvedBoards={starBattleSolvedBoards} onSolve={awardStarBattleMedal} />
      default:          return null
    }
  }

  // Shared sidebar list (reused across mobile/desktop)
  const puzzleList = (
    <div className="flex flex-col gap-1">
      {PUZZLE_LIST.map(p => (
        <button
          key={p.id}
          type="button"
          disabled={!p.live}
          onClick={() => p.live && selectPuzzle(p.id)}
          className={`flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
            selectedId === p.id
              ? 'bg-teal-50'
              : p.live
                ? 'hover:bg-slate-50 cursor-pointer'
                : 'opacity-50 cursor-default'
          }`}
        >
          <span className="text-xl leading-none mt-0.5 flex-shrink-0">{p.emoji}</span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-snug ${
              selectedId === p.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
            }`}>
              {p.name}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-[var(--color-muted)]">{p.desc}</p>
            {p.id === 'slider' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${SLIDER_LABELS[l]}: ${sliderMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${sliderMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {SLIDER_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'lightsout' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as SliderLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${LIGHTS_OUT_LABELS[l]}: ${lightsOutMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${lightsOutMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {LIGHTS_OUT_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'netwalk' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as NetwalkLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${NETWALK_LABELS[l]}: ${netwalkMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${netwalkMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {NETWALK_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'queens' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as QueensLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${QUEENS_LABELS[l]}: ${queensMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${queensMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {QUEENS_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {p.id === '2048' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['bronze', 'silver', 'gold'] as Game2048Medal[]).map(m => (
                  <span
                    key={m}
                    title={`${GAME_2048_MEDALS[m].label}: ${game2048Medals.has(m) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${game2048Medals.has(m) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {GAME_2048_MEDALS[m].emoji}
                  </span>
                ))}
              </div>
            )}
            {p.id === 'starbattle' && (
              <div className="flex items-center gap-1 mt-1.5">
                {(['easy', 'medium', 'hard'] as StarBattleLevel[]).map(l => (
                  <span
                    key={l}
                    title={`${STAR_BATTLE_LABELS[l]}: ${starBattleMedals.has(l) ? 'earned' : 'not yet earned'}`}
                    className={`text-sm leading-none transition-opacity ${starBattleMedals.has(l) ? 'opacity-100' : 'opacity-15'}`}
                  >
                    {STAR_BATTLE_MEDALS[l]}
                  </span>
                ))}
              </div>
            )}
            {!p.live && (
              <span className="mt-1.5 inline-block rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                Soon
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )

  const menuContent = (
    <div className="flex flex-col gap-0.5">
      <Link
        href="https://puzzleweek.abrastat.com"
        onClick={() => setMenuOpen(false)}
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4 flex-shrink-0 text-[var(--color-muted)]" />
        Puzzle Week
      </Link>
      {canManage && (
        <Link
          href="/puzzleweek/admin"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
        >
          Admin
        </Link>
      )}
      <div className="my-1 border-t border-[var(--color-border)]" />
      {puzzleList}
      {user && !isGuest && (
        <>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={() => { void signOut(); setMenuOpen(false) }}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-slate-50 hover:text-[var(--color-text)]"
          >
            Sign out
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      {/* ═══════ Mobile layout — viewport-locked, no page scroll ═══════ */}
      <main
        className="sm:hidden flex flex-col bg-[var(--color-bg)]"
        style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none' }}
      >
        {/* Nav bar */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
          <Link href="https://puzzleweek.abrastat.com" className="select-none flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AbraStat" style={{ width: '100px', height: 'auto' }} />
          </Link>

          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            <span className="truncate text-sm font-semibold text-[var(--color-text)]">
              {PUZZLE_LIST.find(p => p.id === selectedId)?.emoji}{' '}
              {PUZZLE_LIST.find(p => p.id === selectedId)?.name}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text)] transition active:bg-slate-50"
            aria-label="Menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Game fills every remaining pixel */}
        <div className="min-h-0 flex-1" style={{ touchAction: 'none' }}>
          {renderGame()}
        </div>

        {/* Puzzle picker drawer */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="flex w-full max-w-lg flex-col rounded-t-3xl bg-white px-4 pb-8 pt-5 shadow-xl max-h-[85dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)]">Menu</p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted)] transition hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>
              {menuContent}
            </div>
          </div>
        )}
      </main>

      {/* ═══════ Desktop layout ═══════ */}
      <main
        className="hidden sm:block bg-[var(--color-bg)] px-6 py-8"
        style={{ height: '100dvh', overflow: 'hidden', overscrollBehavior: 'none' }}
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">

          {/* Header */}
          <div className="flex relative items-center py-2">
            <Link href="https://puzzleweek.abrastat.com" className="relative z-10 flex-shrink-0 select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="AbraStat" style={{ width: 'clamp(200px, 24vw, 320px)', height: 'auto' }} />
            </Link>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <h1
                className="text-4xl lg:text-5xl font-semibold leading-tight text-[var(--color-text)]"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                Logic Puzzles
              </h1>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] shadow-sm">
                <Calendar className="h-3 w-3" />
                Puzzle Week 2026 extras
              </div>
            </div>
            <div className="relative z-10 ml-auto flex flex-shrink-0 items-center">
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-slate-50"
                aria-label="Menu"
              >
                <Menu className="h-4 w-4" />
                <span>Menu</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-lg">
                    {menuContent}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar + game */}
          <div className="flex min-h-0 flex-1 gap-5 items-stretch overflow-hidden">
            <aside className="flex h-full min-h-0 w-56 flex-shrink-0 self-stretch flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm p-3">
              <p className="px-3 pt-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Puzzles
              </p>
              <div className="h-full min-h-0 flex-1 overflow-y-auto pr-1">
                {puzzleList}
              </div>
              <div className="mt-auto pt-4 border-t border-[var(--color-border)] px-3 pb-2">
                <Link
                  href="https://puzzleweek.abrastat.com"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to Puzzle Week
                </Link>
              </div>
            </aside>

            <section className="flex h-full min-h-0 flex-1 min-w-0 self-stretch overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm">
              <div className="h-full min-h-0 w-full">
                {renderGame()}
              </div>
            </section>
          </div>

        </div>
      </main>
    </>
  )
}
