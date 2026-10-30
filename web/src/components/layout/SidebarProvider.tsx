import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { CommentedOnlyContext } from './commented-only'
import { SidebarContext } from './sidebar-context'
import { useSidebarOpen } from './useSidebarOpen'

/** Owns the rail's open state (see `useSidebarOpen`) and its rail-wide "only commented" switch. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const sidebar = useSidebarOpen()
  const { pathname } = useLocation()
  const { desktop, close } = sidebar
  const [commentedOnly, setCommentedOnly] = useState(false)
  const toggleCommentedOnly = useCallback(() => setCommentedOnly((on) => !on), [])
  const commented = useMemo(() => ({ on: commentedOnly, toggle: toggleCommentedOnly }), [commentedOnly, toggleCommentedOnly])

  // The drawer gives way to the page it led to; the desktop rail keeps the reviewer's choice.
  useEffect(() => {
    if (!desktop) close()
  }, [pathname, desktop, close])

  return (
    <SidebarContext.Provider value={sidebar}>
      <CommentedOnlyContext.Provider value={commented}>{children}</CommentedOnlyContext.Provider>
    </SidebarContext.Provider>
  )
}
