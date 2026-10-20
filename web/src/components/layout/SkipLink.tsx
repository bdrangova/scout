import { useEffect, useRef, type MouseEvent } from 'react'

/** When the starting point is parked a second time, after the page has laid out. */
const PARK_AGAIN_MS = 800

/** Moves focus into the page's `<main>` (made focusable on demand), so the next Tab starts in the content. */
function focusMain(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  const main = document.querySelector('main')
  if (!main) return
  main.tabIndex = -1
  main.focus()
}

/**
 * The first thing Tab reaches on a session page: "Skip to review", hidden until focused. On mount
 * it also parks the browser's sequential-focus starting point just before itself, so the first Tab
 * goes to the skip link and then the header, not to wherever the page's content last laid out.
 */
export function SkipLink() {
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    function park() {
      const anchor = anchorRef.current
      if (!anchor || document.activeElement !== document.body) return
      anchor.focus({ preventScroll: true })
      anchor.blur()
    }
    park()
    // The page's content lays out a moment later (cards, timeline) and the browser moves the starting point with it: park it again.
    const timer = window.setTimeout(park, PARK_AGAIN_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <span ref={anchorRef} tabIndex={-1} className="absolute size-0 outline-none" />
      <a href="#review" onClick={focusMain} className="skip-link">
        Skip to review
      </a>
    </>
  )
}
