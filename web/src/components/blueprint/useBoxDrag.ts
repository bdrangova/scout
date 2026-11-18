import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { BlueprintPoint } from '@scout/shared'

/** A press that moves less than this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4

export interface BoxDragOptions {
  /** False in select mode: a press never starts a drag. */
  enabled: boolean
  /** The canvas zoom right now: screen pixels are divided by it to get canvas units. */
  getScale: () => number
  positionOf: (key: string) => BlueprintPoint
  onMove: (key: string, point: BlueprintPoint) => void
  /** The pointer was released after a drag. */
  onEnd: (key: string) => void
}

export interface BoxDrag {
  draggingKey: string | null
  onPointerDown: (key: string, event: PointerEvent<HTMLElement>) => void
  /** Swallows the click that follows a drag. */
  onClickCapture: (event: MouseEvent<HTMLElement>) => void
}

/** Pointer-drags a box over the zoomed canvas; the box's buttons still click, because capture starts only once the pointer has moved. */
export function useBoxDrag(options: BoxDragOptions): BoxDrag {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const justDragged = useRef(false)
  // Stops following the pointer; called on release, and on unmount in the middle of a drag.
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const onPointerDown = useCallback((key: string, event: PointerEvent<HTMLElement>) => {
    if (!optionsRef.current.enabled || event.button !== 0 || !event.isPrimary) return
    const target = event.currentTarget
    const { pointerId, clientX: startX, clientY: startY } = event
    const origin = optionsRef.current.positionOf(key)
    let dragging = false

    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const dx = next.clientX - startX
      const dy = next.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        dragging = true
        setDraggingKey(key)
        try {
          target.setPointerCapture(pointerId)
        } catch {
          // The window listeners below still follow the pointer.
        }
      }
      const scale = optionsRef.current.getScale() || 1
      optionsRef.current.onMove(key, { x: origin.x + dx / scale, y: origin.y + dy / scale })
    }
    const unlisten = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      stop.current = null
    }
    const end = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return
      unlisten()
      if (!dragging) return
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // Already released.
      }
      setDraggingKey(null)
      justDragged.current = true
      window.setTimeout(() => {
        justDragged.current = false
      }, 0)
      optionsRef.current.onEnd(key)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    stop.current?.()
    stop.current = unlisten
  }, [])

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!justDragged.current) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return { draggingKey, onPointerDown, onClickCapture }
}
