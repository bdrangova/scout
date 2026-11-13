import type { BlueprintPoint } from '../schemas/blueprint.ts'
import type { BlueprintBox, BlueprintDiagram } from './model.ts'

export interface BlueprintLayoutOptions {
  /** Rows are wrapped so they are no wider than this (a single wider box still gets its own row). */
  maxRowWidth: number
  gapX?: number
  gapY?: number
}

/** Size used for a box missing from `sizes`. */
export const BLUEPRINT_DEFAULT_BOX_SIZE = { w: 264, h: 120 }

/** Extra space between the linked boxes and the grid of unlinked ones. */
const UNLINKED_EXTRA_GAP = 40

interface Placed {
  box: BlueprintBox
  w: number
  h: number
}

function wrap(items: Placed[], maxRowWidth: number, gapX: number): Placed[][] {
  const rows: Placed[][] = []
  let row: Placed[] = []
  let width = 0
  for (const item of items) {
    const next = row.length ? width + gapX + item.w : item.w
    if (row.length && next > maxRowWidth) {
      rows.push(row)
      row = []
    }
    width = row.length ? width + gapX + item.w : item.w
    row.push(item)
  }
  if (row.length) rows.push(row)
  return rows
}

/**
 * Automatic arrangement: one band per layer (layer 0 on top), each wrapped into rows and centred on a common axis;
 * unlinked boxes in a wrapped grid below. Returns each box's top-left corner (all coordinates >= 0).
 */
export function layoutBlueprint(
  diagram: BlueprintDiagram,
  sizes: Record<string, { w: number; h: number }>,
  options: BlueprintLayoutOptions,
): Record<string, BlueprintPoint> {
  const { maxRowWidth, gapX = 30, gapY = 62 } = options
  const place = (box: BlueprintBox): Placed => ({ box, ...(sizes[box.key] ?? BLUEPRINT_DEFAULT_BOX_SIZE) })
  const maxLayer = Math.max(-1, ...diagram.boxes.map((b) => b.layer))
  const bands: Placed[][][] = []
  for (let layer = 0; layer <= maxLayer; layer++) bands.push(wrap(diagram.boxes.filter((b) => b.layer === layer).map(place), maxRowWidth, gapX))
  const linkedRows = bands.flat()
  const unlinkedRows = wrap(diagram.boxes.filter((b) => b.layer < 0).map(place), maxRowWidth, gapX)
  const rowWidth = (row: Placed[]): number => row.reduce((sum, p) => sum + p.w, 0) + gapX * (row.length - 1)
  const axisWidth = Math.max(maxRowWidth, ...[...linkedRows, ...unlinkedRows].map(rowWidth))

  const points: Record<string, BlueprintPoint> = {}
  let y = 0
  const put = (rows: Placed[][]): void => {
    for (const row of rows) {
      let x = (axisWidth - rowWidth(row)) / 2
      for (const p of row) {
        points[p.box.key] = { x, y }
        x += p.w + gapX
      }
      y += Math.max(...row.map((p) => p.h)) + gapY
    }
  }
  put(linkedRows)
  if (linkedRows.length && unlinkedRows.length) y += UNLINKED_EXTRA_GAP
  put(unlinkedRows)
  return points
}
