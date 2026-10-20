import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * What the rail needs while it is a drawer: Escape closes it, focus moves into it when it opens, Tab
 * stays inside it, and focus goes back to whatever opened it when it closes. Returns the ref for the panel.
 */
export function useDrawerBehaviour(active: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const panel = ref.current
    if (!active || !panel) return
    const opener = document.activeElement
    panel.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab') return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const current = document.activeElement
      if (!panel.contains(current) || current === panel || (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [active, close])
  return ref
}
