import type { SessionDetail } from '@review-dash/shared'
import { createContext, useContext } from 'react'

export interface SessionContextValue {
  sessionId: string
  detail: SessionDetail
  /** Refetch the detail (after a publish or a review change). */
  reload: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSessionContext must be used inside SessionLayout')
  return value
}
