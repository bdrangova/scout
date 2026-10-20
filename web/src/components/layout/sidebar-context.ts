import { createContext, useContext } from 'react'
import type { SidebarOpenState } from './useSidebarOpen'

export const SidebarContext = createContext<SidebarOpenState | null>(null)

/** The rail's shared open state (`SidebarProvider`): the bar's toggle, the `B` key and the rail itself read it. */
export function useSidebar(): SidebarOpenState {
  const value = useContext(SidebarContext)
  if (!value) throw new Error('useSidebar must be used inside SidebarProvider')
  return value
}
