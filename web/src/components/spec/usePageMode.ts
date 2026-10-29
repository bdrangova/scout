import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { MODE_PARAM, modeSearch, parsePageMode, type PageMode } from '@/lib/mode'
import { findTarget, SCROLL_MARGIN } from './rail-targets'

/** How long a card opened from the grid is held in view while the cards above it load and grow. */
const SETTLE_MS = 2000

/**
 * Brings the card of `path` to the top, and keeps it there while the cards above render their
 * diagrams and frames (they grow after the first paint); the reader's own scroll ends that.
 * Returns the cleanup.
 */
function holdInView(path: string): () => void {
  const element = findTarget(path)
  if (!element) return () => {}
  element.style.scrollMarginTop = SCROLL_MARGIN
  const place = () => element.scrollIntoView({ block: 'start' })
  place()
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
  observer?.observe(document.body)
  const stop = () => {
    observer?.disconnect()
    window.clearTimeout(timer)
    for (const type of USER_SCROLL) window.removeEventListener(type, stop)
  }
  const timer = window.setTimeout(stop, SETTLE_MS)
  for (const type of USER_SCROLL) window.addEventListener(type, stop, { passive: true })
  return stop
}

const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * The Spec and Extras pages' `?mode=` (scroll or grid), and what a grid tile does: switch to the
 * scroll view and bring that item's card into view (like a Files tile opens its file in the cards).
 */
export function usePageMode(): { mode: PageMode; openInScroll: (path: string) => void } {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mode = parsePageMode(searchParams.get(MODE_PARAM))
  const pending = useRef<string | null>(null)

  useEffect(() => {
    if (mode !== 'scroll' || pending.current === null) return
    const path = pending.current
    pending.current = null
    return holdInView(path)
  }, [mode])

  function openInScroll(path: string) {
    pending.current = path
    navigate({ pathname, search: modeSearch(searchParams, 'scroll') })
  }

  return { mode, openInScroll }
}
