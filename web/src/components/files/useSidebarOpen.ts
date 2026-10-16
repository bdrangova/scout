import { useCallback, useState, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'review-dash:files-sidebar'
/** Tailwind's `lg`: wide enough for the sidebar to share the row with the cards. */
const DESKTOP_QUERY = '(min-width: 1024px)'

function mediaQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
}

function subscribe(onChange: () => void): () => void {
  const query = mediaQuery()
  if (!query) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isDesktop(): boolean {
  return mediaQuery()?.matches ?? true
}

function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'closed'
  } catch {
    return true
  }
}

function storeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed')
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

export interface SidebarOpenState {
  /** Wide layout: the sidebar sits beside the content. Otherwise it is an overlay drawer. */
  desktop: boolean
  open: boolean
  toggle: () => void
  close: () => void
}

/** Open by default (remembered) beside the content; closed by default as a drawer on narrow screens. */
export function useSidebarOpen(): SidebarOpenState {
  const desktop = useSyncExternalStore(subscribe, isDesktop, () => true)
  const [desktopOpen, setDesktopOpen] = useState(readStoredOpen)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const open = desktop ? desktopOpen : drawerOpen

  const toggle = useCallback(() => {
    if (desktop) {
      setDesktopOpen((current) => {
        storeOpen(!current)
        return !current
      })
    } else {
      setDrawerOpen((current) => !current)
    }
  }, [desktop])

  const close = useCallback(() => {
    if (desktop) {
      storeOpen(false)
      setDesktopOpen(false)
    } else {
      setDrawerOpen(false)
    }
  }, [desktop])

  return { desktop, open, toggle, close }
}
