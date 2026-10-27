import type { JournalEntry } from '@review-dash/shared'
import { createContext, useContext } from 'react'

/** Scout's anchored notes of the file a card shows, and where the diff reports which of them it placed. */
export interface JournalAnnotationsValue {
  /** The file's live anchored entries (summaries and file-level notes belong to the strip). */
  entries: readonly JournalEntry[]
  /** The ids the diff placed under a line, relocated against the current patch (empty again when it unmounts); the rest are stale. */
  onPlaced: (ids: readonly string[]) => void
}

/** Provided by `FileReviewCard`; absent where a diff is shown without Scout's notes. */
export const JournalAnnotationsContext = createContext<JournalAnnotationsValue | null>(null)

export function useJournalAnnotations(): JournalAnnotationsValue | null {
  return useContext(JournalAnnotationsContext)
}
