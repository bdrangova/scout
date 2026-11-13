import type { BlueprintDiagramLayout, BlueprintLayout, BlueprintPoint } from '@scout/shared'
import { useCallback, useEffect, useMemo, useRef } from 'react'

const POSITIONS_DELAY_MS = 400
const VIEWPORT_DELAY_MS = 600

export type Viewport = NonNullable<BlueprintDiagramLayout['viewport']>

/**
 * What this page itself wrote, per session and diagram. The layout the server returned does not change after
 * our own PUT (no event is sent for it), so the write stands in for it until a newer layout arrives (`base` = its `updatedAt`).
 */
const written = new Map<string, { base: string | null; value: BlueprintDiagramLayout | null }>()

/** The saved arrangement of a diagram: the server's, unless this page wrote a newer one. */
export function savedDiagramLayout(sessionId: string, layout: BlueprintLayout | null, diagramId: string): BlueprintDiagramLayout | null {
  const own = written.get(`${sessionId}\u0000${diagramId}`)
  if (own && own.base === (layout?.updatedAt ?? null)) return own.value
  return layout?.diagrams[diagramId] ?? null
}

export interface DiagramPersistence {
  /** Remember the full positions map and write it shortly after the last change. */
  savePositions: (positions: Record<string, BlueprintPoint>) => void
  /** Remember the pan and zoom and write them once they settle. */
  saveViewport: (viewport: Viewport) => void
  /** Forget the saved arrangement (positions and view) right away. */
  tidy: () => void
}

interface Options {
  sessionId: string
  diagramId: string
  layout: BlueprintLayout | null
  save: (diagram: string, layout: BlueprintDiagramLayout | null) => Promise<void>
}

/** Debounced, never-blocking writes of one diagram's arrangement; a failed write is only a console warning. */
export function useDiagramPersistence({ sessionId, diagramId, layout, save }: Options): DiagramPersistence {
  const latest = useRef({ layout, save })
  useEffect(() => {
    latest.current = { layout, save }
  })
  const current = useRef<BlueprintDiagramLayout>(savedDiagramLayout(sessionId, layout, diagramId) ?? { positions: {} })
  const timers = useRef<{ positions: number | null; viewport: number | null }>({ positions: null, viewport: null })

  const write = useCallback(
    (value: BlueprintDiagramLayout | null) => {
      written.set(`${sessionId}\u0000${diagramId}`, { base: latest.current.layout?.updatedAt ?? null, value })
      latest.current.save(diagramId, value).catch((error: unknown) => console.warn('Could not save the Blueprint layout', error))
    },
    [sessionId, diagramId],
  )

  const clear = useCallback(() => {
    for (const name of ['positions', 'viewport'] as const) {
      const id = timers.current[name]
      if (id !== null) window.clearTimeout(id)
      timers.current[name] = null
    }
  }, [])

  const flush = useCallback(() => {
    if (timers.current.positions === null && timers.current.viewport === null) return
    clear()
    write({ ...current.current })
  }, [clear, write])

  const schedule = useCallback(
    (name: 'positions' | 'viewport', delay: number) => {
      const id = timers.current[name]
      if (id !== null) window.clearTimeout(id)
      // One write carries both parts: the other timer's change goes out with it.
      timers.current[name] = window.setTimeout(() => {
        clear()
        write({ ...current.current })
      }, delay)
    },
    [clear, write],
  )

  // Leaving the diagram (or the page) writes what is still waiting.
  useEffect(() => flush, [flush])

  const savePositions = useCallback(
    (positions: Record<string, BlueprintPoint>) => {
      current.current = { ...current.current, positions }
      schedule('positions', POSITIONS_DELAY_MS)
    },
    [schedule],
  )
  const saveViewport = useCallback(
    (viewport: Viewport) => {
      current.current = { ...current.current, viewport }
      schedule('viewport', VIEWPORT_DELAY_MS)
    },
    [schedule],
  )
  const tidy = useCallback(() => {
    clear()
    current.current = { positions: {} }
    write(null)
  }, [clear, write])

  return useMemo(() => ({ savePositions, saveViewport, tidy }), [savePositions, saveViewport, tidy])
}
