import { createContext, useContext } from 'react'
import type { JournalState } from '@/lib/hooks'

/** Scout's journal of the session; empty (and never throws) where no provider is mounted. */
export const NO_JOURNAL: JournalState = { journal: null, loading: false, error: null, reload: () => {} }

export const JournalContext = createContext<JournalState>(NO_JOURNAL)

export function useJournalState(): JournalState {
  return useContext(JournalContext)
}
