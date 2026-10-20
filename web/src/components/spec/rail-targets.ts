/** The page's rail list scrolls its cards into view; each card sits in a wrapper carrying this attribute (the item's path). */
export const TARGET_ATTR = 'data-rail-target'

/** Keeps a scrolled-to element clear of the sticky bar. */
export const SCROLL_MARGIN = 'calc(var(--shell-h) + 12px)'

export function findTarget(path: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TARGET_ATTR}="${CSS.escape(path)}"]`)
}

function reduceMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function scrollToElement(element: HTMLElement): void {
  element.style.scrollMarginTop = SCROLL_MARGIN
  element.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
}

/** Scrolls to the card of `path`; returns false when it is not on the page. */
export function scrollToTarget(path: string): boolean {
  const element = findTarget(path)
  if (!element) return false
  scrollToElement(element)
  return true
}

/** The `occurrence`-th (0-based) rendered heading in the card of `path` whose text is `text`, else the card itself. */
export function scrollToHeading(path: string, text: string, occurrence: number): void {
  const card = findTarget(path)
  if (!card) return
  const matches = [...card.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].filter((heading) => heading.textContent?.trim() === text)
  scrollToElement(matches[occurrence] ?? card)
}
