import type { BlueprintArrow } from '@scout/shared'
import { useMemo } from 'react'
import { arrowGeometry, type Rect } from './arrow-path'

export interface BlueprintArrowsProps {
  /** The arrows to draw (the diagram's, less the kinds switched off). */
  arrows: readonly BlueprintArrow[]
  rects: Record<string, Rect>
  /** The box under the pointer or focus: its arrows stand out and the others fade. */
  active: string | null
}

const INK = 'var(--ink)'

interface Drawn {
  arrow: BlueprintArrow
  d: string
  label: { x: number; y: number }
}

/** The arrows of a diagram, redrawn from the current box rectangles (so they follow a box while it moves). */
export function BlueprintArrows({ arrows, rects, active }: BlueprintArrowsProps) {
  const drawn = useMemo(() => {
    const placed = arrows.filter((arrow) => rects[arrow.from] && rects[arrow.to])
    const xs = Object.values(rects).flatMap((rect) => [rect.x, rect.x + rect.w])
    const centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    // Arrows arriving at one box fan out along its edge, ordered by where they come from.
    const byTarget = new Map<string, BlueprintArrow[]>()
    for (const arrow of placed) byTarget.set(arrow.to, [...(byTarget.get(arrow.to) ?? []), arrow])
    return placed.map((arrow): Drawn => {
      const siblings = [...(byTarget.get(arrow.to) ?? [])].sort((a, b) => (rects[a.from]?.x ?? 0) - (rects[b.from]?.x ?? 0))
      const fan = siblings.length > 1 ? siblings.indexOf(arrow) / (siblings.length - 1) - 0.5 : 0
      const from = rects[arrow.from] as Rect
      const to = rects[arrow.to] as Rect
      return { arrow, ...arrowGeometry(from, to, fan, centerX) }
    })
  }, [arrows, rects])

  return (
    <svg width="1" height="1" className="pointer-events-none absolute top-0 left-0 overflow-visible" aria-hidden data-slot="blueprint-arrows">
      <defs>
        <marker id="bp-tri" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M1 1L11 6L1 11Z" fill="var(--paper)" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        </marker>
        <marker id="bp-arr" viewBox="0 0 12 12" refX="2" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M2 1L10 6L2 11" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {drawn.map(({ arrow, d, label }) => {
        const hot = active !== null && (arrow.from === active || arrow.to === active)
        const dim = active !== null && !hot
        return (
          <g key={`${arrow.from}>${arrow.to}`} data-arrow={arrow.extends ? 'extends' : 'uses'} data-hot={hot || undefined} style={{ opacity: dim ? 0.08 : 1, transition: 'opacity .15s' }}>
            <path
              d={d}
              fill="none"
              stroke={INK}
              strokeWidth={hot ? 2.4 : 1.5}
              strokeDasharray={arrow.extends ? undefined : '5 4'}
              opacity={hot ? 1 : arrow.extends ? 0.5 : 0.4}
              markerEnd={`url(#${arrow.extends ? 'bp-tri' : 'bp-arr'})`}
            />
            {arrow.count > 1 && (
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill={INK} stroke="var(--paper)" strokeWidth="5" paintOrder="stroke" style={{ font: '700 11px var(--font-mono)' }}>
                {arrow.count}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
