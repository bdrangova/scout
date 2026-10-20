import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

/** Width of the fade over a clipped edge, in px. */
const FADE = 20

export interface FadeScroll<T extends HTMLElement> {
  ref: React.RefObject<T | null>
  onScroll: () => void
  /** The edge-fade mask while content is clipped, else undefined. */
  style: CSSProperties | undefined
  /** Content overflows, so the element should be keyboard-focusable. */
  scrollable: boolean
  /** Re-measure; call when the content changed outside React's knowledge. */
  measure: () => void
}

/**
 * Sideways-scrolling strip behaviour: tracks which edges are clipped (resize + scroll), fades them
 * out with a mask, and turns a mouse wheel's vertical delta into a horizontal scroll while it overflows.
 * Spread `ref`, `onScroll` and `style` on a `overflow-x-auto` element. `deps` re-measure on content change.
 */
export function useFadeScroll<T extends HTMLElement>(deps: readonly unknown[]): FadeScroll<T> {
  const ref = useRef<T | null>(null)
  const [clipped, setClipped] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setClipped((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller names what changes the content
  }, [measure, ...deps])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const scrollable = clipped.start || clipped.end
  const mask = scrollable
    ? `linear-gradient(to right, ${clipped.start ? 'transparent' : 'black'}, black ${FADE}px, black calc(100% - ${FADE}px), ${clipped.end ? 'transparent' : 'black'})`
    : undefined
  return { ref, onScroll: measure, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined, scrollable, measure }
}
