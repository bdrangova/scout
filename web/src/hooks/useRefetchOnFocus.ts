import { useEffect, useRef } from 'react'

/** Calls `reload` whenever the window regains focus or the tab becomes visible again (no polling, no SSE). */
export function useRefetchOnFocus(reload: () => void): void {
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })
  useEffect(() => {
    const onFocus = () => reloadRef.current()
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadRef.current()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
