import type { Rect } from './arrow-path'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 2

const FIT_PADDING = 48

export interface View {
  x: number
  y: number
  scale: number
}

/** The pan and zoom that centre the rectangles in a viewport, zoomed out as far as needed but never in past 100%. Null with nothing to show or no room. */
export function fitView(rects: readonly Rect[], viewport: { w: number; h: number }): View | null {
  if (rects.length === 0 || viewport.w <= 0 || viewport.h <= 0) return null
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const width = Math.max(...rects.map((rect) => rect.x + rect.w)) - minX
  const height = Math.max(...rects.map((rect) => rect.y + rect.h)) - minY
  const fit = Math.min((viewport.w - 2 * FIT_PADDING) / Math.max(width, 1), (viewport.h - 2 * FIT_PADDING) / Math.max(height, 1))
  const scale = Math.min(1, Math.max(MIN_SCALE, fit))
  return { scale, x: (viewport.w - width * scale) / 2 - minX * scale, y: (viewport.h - height * scale) / 2 - minY * scale }
}
