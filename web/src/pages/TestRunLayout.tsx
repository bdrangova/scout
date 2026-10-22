import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router'
import { ShellConfigProvider } from '@/components/layout/ShellConfigProvider'
import { SessionError } from '@/components/layout/SessionError'
import { SessionErrorBar } from '@/components/layout/SessionErrorBar'
import { SessionShell } from '@/components/layout/SessionShell'
import { StatusDot } from '@/components/ui/status-dot'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionDetail } from '@/lib/hooks'
import { SessionContext, type SessionContextValue } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'

/** `/t/:id`: the test run's frame, SessionLayout's counterpart with the test-run shell config and no PR comments. */
export function TestRunLayout() {
  const { id } = useParams()
  const { detail, error, reload } = useSessionDetail(id)
  const value = useMemo<SessionContextValue | null>(
    () => (id && detail ? { sessionId: id, detail, reload } : null),
    [id, detail, reload],
  )

  if (!id) return <Navigate to="/t" replace />

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
        Loading test run…
      </main>
    )
  }

  // A code review opened under /t: hand it to its own routes.
  if (!isTestRunDetail(value.detail)) return <Navigate to={`/s/${encodeURIComponent(id)}`} replace />

  return (
    <SessionContext.Provider value={value}>
      <ShellConfigProvider kind="test-run">
        <ReviewProvider>
          <SessionShell />
        </ReviewProvider>
      </ShellConfigProvider>
    </SessionContext.Provider>
  )
}
