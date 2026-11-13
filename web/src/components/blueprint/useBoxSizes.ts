import { useLayoutEffect, useState, type RefObject } from 'react'

export type BoxSizes = Record<string, { w: number; h: number }>

function same(a: BoxSizes, b: BoxSizes): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key]?.w === b[key]?.w && a[key]?.h === b[key]?.h)
}

/**
 * The rendered size of every `[data-box-key]` element inside `root`, in canvas units (offset sizes ignore the zoom transform).
 * `measured` turns true after the first read; `signature` changes whenever the set of boxes or their content does.
 */
export function useBoxSizes(root: RefObject<HTMLElement | null>, signature: string): { sizes: BoxSizes; measured: boolean } {
  const [sizes, setSizes] = useState<BoxSizes>({})
  const [measured, setMeasured] = useState(false)

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const boxes = [...element.querySelectorAll<HTMLElement>('[data-box-key]')]
    const read = () => {
      const next: BoxSizes = {}
      for (const box of boxes) {
        const key = box.dataset.boxKey
        if (key && box.offsetWidth > 0 && box.offsetHeight > 0) next[key] = { w: box.offsetWidth, h: box.offsetHeight }
      }
      setSizes((previous) => (same(previous, next) ? previous : next))
      setMeasured(true)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    for (const box of boxes) observer.observe(box)
    return () => observer.disconnect()
  }, [root, signature])

  return { sizes, measured }
}
