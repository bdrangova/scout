import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { RailWidth } from './useRailWidth'

const KEY_STEP = 16

/**
 * The thin grip on the rail's right edge: drag to widen or narrow the rail, arrow keys nudge it,
 * Home/End jump to the narrowest/widest, and a double-click puts it back to its natural width.
 */
export function RailResizeHandle({ width, min, max, setWidth, reset }: RailWidth) {
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = width
    handle.setPointerCapture(event.pointerId)
    document.body.classList.add('rail-resizing')
    const onMove = (move: globalThis.PointerEvent) => setWidth(startWidth + move.clientX - startX)
    const onUp = () => {
      document.body.classList.remove('rail-resizing')
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = { ArrowLeft: width - KEY_STEP, ArrowRight: width + KEY_STEP, Home: min, End: max }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setWidth(next)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-controls="session-rail"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
      className={cn(
        'absolute inset-y-0 right-0 z-10 w-[6px] cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-transparent after:transition-colors',
        'hover:after:bg-ink-muted focus-visible:after:bg-ink',
      )}
    />
  )
}
