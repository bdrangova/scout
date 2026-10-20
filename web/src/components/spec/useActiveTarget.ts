import { useEffect, useState } from 'react'
import { findTarget } from './rail-targets'

/**
 * The path of the card nearest the top of the viewport, as the page scrolls (`null` until one is
 * in view). `select` sets it at once, so a click shows its row selected before the scroll lands.
 */
export function useActiveTarget(paths: readonly string[]): [active: string | null, select: (path: string) => void] {
  const [active, setActive] = useState<string | null>(null)
  const key = paths.join('\n')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const elements = new Map<Element, string>()
    const update = () => {
      let best: string | null = null
      let bestTop = Infinity
      for (const [element, path] of elements) {
        if (!visible.has(path)) continue
        const top = element.getBoundingClientRect().top
        if (top < bestTop) {
          best = path
          bestTop = top
        }
      }
      if (best !== null) setActive(best)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = elements.get(entry.target)
          if (path === undefined) continue
          if (entry.isIntersecting) visible.add(path)
          else visible.delete(path)
        }
        update()
      },
      { rootMargin: '-64px 0px -55% 0px' },
    )
    for (const path of key.split('\n')) {
      const element = findTarget(path)
      if (!element) continue
      elements.set(element, path)
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [key])

  return [active, setActive]
}
