import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { SidebarContext } from './sidebar-context'
import { useSidebarOpen } from './useSidebarOpen'

/** Owns the rail's open state for the session shell (see `useSidebarOpen`). */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const sidebar = useSidebarOpen()
  const { pathname } = useLocation()
  const { desktop, close } = sidebar

  // The drawer gives way to the page it led to; the desktop rail keeps the reviewer's choice.
  useEffect(() => {
    if (!desktop) close()
  }, [pathname, desktop, close])

  return <SidebarContext.Provider value={sidebar}>{children}</SidebarContext.Provider>
}
