import type { PrCommentsResponse, PrReplyKind } from '@scout/shared'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { apiGet } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { prCommentsPath } from '@/lib/paths'
import { putPrReply } from '@/lib/pr-replies'
import { useStoreEvents } from '@/lib/useStoreEvents'
import { PrCommentsContext, prCommentsValueFrom } from './pr-comments-context'

/**
 * Loads `GET /api/sessions/:id/pr-comments` and refetches it on the session's `pr-comments.updated`
 * (the stale answer stays on screen meanwhile). A failed load leaves the value empty with `error` set:
 * PR comments are an extra, they never block the review. Also saves the reply boxes' text and lets Submit
 * flush the ones still pending.
 */
export function PrCommentsProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const state = useAsync(`pr-comments:${sessionId}`, () => apiGet<PrCommentsResponse>(prCommentsPath(sessionId)))
  const { reload, data, loading, error } = state
  useStoreEvents({
    'pr-comments.updated': (event) => {
      if (event.sessionId === sessionId) reload()
    },
  })

  const saveReply = useCallback((commentId: string, body: string, kind?: PrReplyKind) => putPrReply(sessionId, commentId, body, kind), [sessionId])
  const [flushers] = useState(() => new Set<() => Promise<boolean>>())
  const registerReplyFlush = useCallback((flush: () => Promise<boolean>) => {
    flushers.add(flush)
    return () => {
      flushers.delete(flush)
    }
  }, [flushers])
  const flushReplies = useCallback(async () => {
    const results = await Promise.all([...flushers].map((flush) => flush()))
    return results.every(Boolean)
  }, [flushers])

  const value = useMemo(
    () => prCommentsValueFrom(data, { loading, error, reload, saveReply, registerReplyFlush, flushReplies }),
    [data, loading, error, reload, saveReply, registerReplyFlush, flushReplies],
  )

  return <PrCommentsContext.Provider value={value}>{children}</PrCommentsContext.Provider>
}
