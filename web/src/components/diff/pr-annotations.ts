import { createContext, useContext } from 'react'
import type { PrThread } from '@/lib/pr-threads'

/** The GitHub threads of the file a card shows, and where the diff reports which of them it drew. */
export interface PrAnnotationsValue {
  threads: readonly PrThread[]
  /** The ids of the threads the diff placed under a line (empty again when it unmounts); the rest belong in the card's footer. */
  onPlaced: (ids: readonly string[]) => void
}

/** Provided by `FileReviewCard`; absent where a diff is shown without PR comments. */
export const PrAnnotationsContext = createContext<PrAnnotationsValue | null>(null)

export function usePrAnnotations(): PrAnnotationsValue | null {
  return useContext(PrAnnotationsContext)
}
