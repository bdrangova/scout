import { layoutBlueprint, type BlueprintDiagram, type BlueprintDiagramLayout, type BlueprintPoint } from '@scout/shared'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { BoxSizes } from './useBoxSizes'
import type { DiagramPersistence } from './useDiagramPersistence'

const ORIGIN: BlueprintPoint = { x: 0, y: 0 }

export interface DiagramLayout {
  /** Top-left corner of every box: the user's position, else the automatic one. */
  positions: Record<string, BlueprintPoint>
  move: (key: string, point: BlueprintPoint) => void
  /** A drag ended: save the arrangement. */
  commit: () => void
  /** Back to the automatic layout. */
  reset: () => void
}

interface Options {
  diagram: BlueprintDiagram
  sizes: BoxSizes
  maxRowWidth: number
  saved: BlueprintDiagramLayout | null
  persistence: DiagramPersistence
}

/**
 * The positions of a diagram's boxes: the automatic layout of the measured boxes, overridden by the saved
 * positions, overridden by what the user moves. The saved layout is read once, when the diagram opens, so a
 * layout that arrives later never moves boxes the user is working with.
 */
export function useDiagramLayout({ diagram, sizes, maxRowWidth, saved, persistence }: Options): DiagramLayout {
  const [moved, setMoved] = useState<Record<string, BlueprintPoint>>(() => saved?.positions ?? {})
  const movedRef = useRef(moved)

  const auto = useMemo(() => layoutBlueprint(diagram, sizes, { maxRowWidth }), [diagram, sizes, maxRowWidth])
  const positions = useMemo(() => {
    const result: Record<string, BlueprintPoint> = {}
    for (const box of diagram.boxes) result[box.key] = moved[box.key] ?? auto[box.key] ?? ORIGIN
    return result
  }, [diagram, moved, auto])

  const move = useCallback((key: string, point: BlueprintPoint) => {
    movedRef.current = { ...movedRef.current, [key]: point }
    setMoved(movedRef.current)
  }, [])
  const commit = useCallback(() => {
    // Boxes that left the diagram (their files are no longer changed) are not saved back.
    const keys = new Set(diagram.boxes.map((box) => box.key))
    persistence.savePositions(Object.fromEntries(Object.entries(movedRef.current).filter(([key]) => keys.has(key))))
  }, [persistence, diagram])
  const reset = useCallback(() => {
    movedRef.current = {}
    setMoved({})
    persistence.tidy()
  }, [persistence])

  return { positions, move, commit, reset }
}
