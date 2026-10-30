import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'scout:rail-width'
/** The rail's natural width, and the narrowest it goes. */
export const RAIL_MIN_WIDTH = 296
/** The widest the rail goes: a third of the window (never below the minimum). */
const MAX_FRACTION = 1 / 3

export function railMaxWidth(viewport: number): number {
  return Math.max(RAIL_MIN_WIDTH, Math.floor(viewport * MAX_FRACTION))
}

export function clampRailWidth(width: number, viewport: number): number {
  return Math.round(Math.min(Math.max(width, RAIL_MIN_WIDTH), railMaxWidth(viewport)))
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth
}

function readStoredWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : RAIL_MIN_WIDTH
  } catch {
    return RAIL_MIN_WIDTH
  }
}

function storeWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // Storage unavailable: the width lasts for this page only.
  }
}

export interface RailWidth {
  /** The width to draw, already fitted to the current window. */
  width: number
  min: number
  max: number
  /** Sets (and remembers) a width; it is clamped to the min/max. */
  setWidth: (width: number) => void
  reset: () => void
}

/**
 * The desktop rail's width: dragged between its natural 296px and a third of the window, remembered
 * across visits. A narrower window shrinks the drawn width without forgetting the chosen one.
 */
export function useRailWidth(): RailWidth {
  const [chosen, setChosen] = useState(readStoredWidth)
  const [viewport, setViewport] = useState(viewportWidth)

  useEffect(() => {
    const onResize = () => setViewport(viewportWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setWidth = useCallback((width: number) => {
    const next = clampRailWidth(width, viewportWidth())
    setChosen(next)
    storeWidth(next)
  }, [])

  const reset = useCallback(() => setWidth(RAIL_MIN_WIDTH), [setWidth])

  return { width: clampRailWidth(chosen, viewport), min: RAIL_MIN_WIDTH, max: railMaxWidth(viewport), setWidth, reset }
}
