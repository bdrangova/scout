import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router'
import { SessionError } from '@/components/layout/SessionError'
import { SessionErrorBar } from '@/components/layout/SessionErrorBar'
import { SessionShell } from '@/components/layout/SessionShell'
import { StatusDot } from '@/components/ui/status-dot'
import { useSessionDetail } from '@/lib/hooks'
import { SessionContext, type SessionContextValue } from '@/lib/session-context'
import { PrCommentsProvider } from '@/state/PrCommentsProvider'
import { ReviewProvider } from '@/state/ReviewProvider'

export function SessionLayout() {
  const { id } = useParams()
  const { detail, error, reload } = useSessionDetail(id)
  const value = useMemo<SessionContextValue | null>(
    () => (id && detail ? { sessionId: id, detail, reload } : null),
    [id, detail, reload],
  )

  if (!id) return <Navigate to="/" replace />

  if (error) {
    return (
      <>
        <SessionErrorBar id={id} />
        <SessionError id={id} error={error} onRetry={reload} />
      </>
    )
  }

  if (!value) {
    return (
      <main className="flex items-center justify-center gap-2.5 px-6 py-24 text-sm font-semibold text-ink-muted" aria-busy="true">
        <StatusDot tone="info" pulse label="" />
        Loading session…
      </main>
    )
  }

  return (
    <SessionContext.Provider value={value}>
      <ReviewProvider>
        <PrCommentsProvider sessionId={id}>
          <SessionShell />
        </PrCommentsProvider>
      </ReviewProvider>
    </SessionContext.Provider>
  )
}
