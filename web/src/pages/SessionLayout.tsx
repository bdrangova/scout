import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router'
import { SessionError } from '@/components/layout/SessionError'
import { SessionErrorBar } from '@/components/layout/SessionErrorBar'
import { ShellConfigProvider } from '@/components/layout/ShellConfigProvider'
import { SessionShell } from '@/components/layout/SessionShell'
import { StatusDot } from '@/components/ui/status-dot'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionDetail } from '@/lib/hooks'
import { SessionContext, type SessionContextValue } from '@/lib/session-context'
import { PrReviewProvider } from '@/components/prreview/PrReviewProvider'
import { JournalProvider } from '@/state/JournalProvider'
import { PrCommentsProvider } from '@/state/PrCommentsProvider'
import { ReviewProvider } from '@/state/ReviewProvider'

export function SessionLayout() {
  const { id } = useParams()
  const { detail, error, reload } = useSessionDetail(id)
  const value = useMemo<SessionContextValue | null>(
    () => (id && detail ? { sessionId: id, detail, reload } : null),
    [id, detail, reload],
  )

  if (!id) return <Navigate to="/d" replace />

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

  // A test run opened under /s: hand it to its own routes.
  if (isTestRunDetail(value.detail)) return <Navigate to={`/t/${encodeURIComponent(id)}`} replace />

  return (
    <SessionContext.Provider value={value}>
      <ShellConfigProvider kind={value.detail.manifest.kind === 'pr-review' ? 'pr-review' : 'code-review'}>
        <ReviewProvider>
          <PrCommentsProvider sessionId={id}>
            <JournalProvider sessionId={id}>
              <PrReviewProvider detail={value.detail}>
                <SessionShell />
              </PrReviewProvider>
            </JournalProvider>
          </PrCommentsProvider>
        </ReviewProvider>
      </ShellConfigProvider>
    </SessionContext.Provider>
  )
}
