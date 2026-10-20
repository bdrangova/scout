import { useContext } from 'react'
import { SidebarContext } from '@/components/layout/sidebar-context'

/** Scrolls a page panel into view and moves focus to it (closing the drawer below 1024px). */
export function useJumpToPanel(id: string): () => void {
  const sidebar = useContext(SidebarContext)
  return () => {
    if (sidebar && !sidebar.desktop) sidebar.close()
    const panel = document.getElementById(id)
    panel?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    panel?.focus({ preventScroll: true })
  }
}
