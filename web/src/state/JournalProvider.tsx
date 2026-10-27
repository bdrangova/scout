import type { ReactNode } from 'react'
import { useJournal } from '@/lib/hooks'
import { JournalContext } from './journal-context'

/**
 * Loads the session's journal once for every card and the Journal page. A failed load leaves the
 * journal empty: Scout's notes are an extra, they never block the review.
 */
export function JournalProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const state = useJournal(sessionId)
  return <JournalContext.Provider value={state}>{children}</JournalContext.Provider>
}
