"use client"

import { useMemo } from 'react'
import type { Data } from 'plotly.js'
import { useStore } from './store'

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item >= 0)
  }
  const single = Number(value)
  return Number.isInteger(single) && single >= 0 ? [single] : []
}

export function normalizeBrushRows(rows: number[]): number[] {
  return [...new Set(rows.filter(row => Number.isInteger(row) && row >= 0))].sort((a, b) => a - b)
}

export function areBrushRowsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function effectiveBrushRows(hovered: number[], pinned: number[]): number[] {
  return hovered.length > 0 ? hovered : pinned
}

export function useEffectiveBrushRows() {
  const hovered = useStore(state => state.brush.hovered)
  const pinned = useStore(state => state.brush.pinned)
  return useMemo(() => effectiveBrushRows(hovered, pinned), [hovered, pinned])
}

export function useEffectiveBrushSet() {
  const rows = useEffectiveBrushRows()
  return useMemo(() => new Set(rows), [rows])
}

type PlotlyEventPoint = {
  customdata?: unknown
  pointIndices?: number[]
  pointIndex?: number
  pointNumber?: number
  data?: Partial<Data> & { customdata?: unknown }
}

export function extractRowsFromPlotlyPoints(points: PlotlyEventPoint[] | undefined): number[] {
  if (!points || points.length === 0) return []

  const rows: number[] = []

  points.forEach(point => {
    rows.push(...toNumberArray(point.customdata))

    if (point.pointIndices && point.pointIndices.length > 0) {
      const traceCustomdata = point.data?.customdata
      if (Array.isArray(traceCustomdata)) {
        point.pointIndices.forEach(index => {
          rows.push(...toNumberArray(traceCustomdata[index]))
        })
      }
    }

    if (rows.length === 0) {
      const traceCustomdata = point.data?.customdata
      const pointIndex = point.pointIndex ?? point.pointNumber
      if (Array.isArray(traceCustomdata) && typeof pointIndex === 'number') {
        rows.push(...toNumberArray(traceCustomdata[pointIndex]))
      }
    }
  })

  return normalizeBrushRows(rows)
}

export function selectedPointIndicesForTrace(
  customdata: unknown,
  brushSet: Set<number>,
): number[] | null {
  if (!(customdata instanceof Array)) return null

  const selected: number[] = []
  customdata.forEach((entry, index) => {
    const rows = toNumberArray(entry)
    if (rows.some(row => brushSet.has(row))) {
      selected.push(index)
    }
  })

  return selected
}

export function createPlotlySelectionStyles<T extends Partial<Data>>(trace: T): T & Partial<Data> {
  return {
    ...trace,
    selected: {
      marker: {
        opacity: 1,
      },
    },
    unselected: {
      marker: {
        opacity: 0.12,
      },
    },
  }
}
