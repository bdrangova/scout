export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ArrowGeometry {
  /** SVG path data, from the dependent box to the one it leans on. */
  d: string
  /** Where the count label sits. */
  label: { x: number; y: number }
}

/** Clearance between an arrow tip and the box edge, so the head stays visible. */
const TIP_GAP = 9

/**
 * The curve from `from` (the dependent box) to `to` (what it leans on). It leaves and arrives through the
 * edges that face each other: top and bottom when the boxes are stacked, the sides when they sit level.
 * `fan` (-0.5 to 0.5) slides the arrival point along the target's edge so several arrows do not pile up;
 * `centerX` is the middle of the diagram, which tall straight-up arrows bow away from.
 */
export function arrowGeometry(from: Rect, to: Rect, fan: number, centerX: number): ArrowGeometry {
  const ax = from.x + from.w / 2
  const bx = to.x + to.w / 2 + fan * to.w * 0.6
  if (from.y > to.y + to.h) {
    const y1 = from.y
    const y2 = to.y + to.h + TIP_GAP
    const c = Math.max(26, (y1 - y2) * 0.45)
    const bow = y1 - y2 > 230 && Math.abs(ax - bx) < 220 ? (ax + bx < centerX * 2 ? -1 : 1) * Math.min(300, (y1 - y2) * 0.42) : 0
    return {
      d: `M${ax} ${y1} C${ax + bow} ${y1 - c} ${bx + bow} ${y2 + c} ${bx} ${y2}`,
      label: { x: (ax + bx) / 2 + bow * 0.75, y: (y1 + y2) / 2 },
    }
  }
  if (from.y + from.h < to.y) {
    const y1 = from.y + from.h
    const y2 = to.y - TIP_GAP
    const c = Math.max(26, (y2 - y1) * 0.45)
    return { d: `M${ax} ${y1} C${ax} ${y1 + c} ${bx} ${y2 - c} ${bx} ${y2}`, label: { x: (ax + bx) / 2, y: (y1 + y2) / 2 } }
  }
  const leftToRight = from.x < to.x
  const x1 = leftToRight ? from.x + from.w : from.x
  const x2 = leftToRight ? to.x - TIP_GAP : to.x + to.w + TIP_GAP
  const y1 = from.y + Math.min(30, from.h / 2)
  const y2 = to.y + Math.min(30, to.h / 2) + fan * 16
  const lean = leftToRight ? 14 : -14
  return {
    d: `M${x1} ${y1} C${x1 + lean} ${y1 - 34} ${x2 - lean} ${y2 - 34} ${x2} ${y2}`,
    label: { x: (x1 + x2) / 2, y: y1 - 28 },
  }
}
