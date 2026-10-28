import { useState } from 'react'

export type SessionListLayout = 'list' | 'grid'
export const SESSION_LAYOUT_KEY = 'scout:session-list-layout'
export const SESSION_CARD_GRID = 'grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3'

export function useSessionListLayout() {
  const [layout, setLayout] = useState<SessionListLayout>(() => {
    try { return window.localStorage.getItem(SESSION_LAYOUT_KEY) === 'grid' ? 'grid' : 'list' } catch { return 'list' }
  })
  function changeLayout(next: SessionListLayout) {
    setLayout(next)
    try { window.localStorage.setItem(SESSION_LAYOUT_KEY, next) } catch { /* The in-memory choice still works. */ }
  }
  return { layout, setLayout: changeLayout }
}
