import { FolderX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { SessionHeader } from '@/components/layout/SessionHeader'
import { SessionHotkeys } from '@/components/layout/SessionHotkeys'
import { SessionLiveUpdates } from '@/components/layout/SessionLiveUpdates'
import { Button } from '@/components/ui/button'
import { ApiRequestError } from '@/lib/api'
import { useSessionDetail } from '@/lib/hooks'
import { describeApiError } from '@/lib/runs'
import { SessionContext, type SessionContextValue } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'

export function SessionLayout() {
  const { id } = useParams()
  const { detail, error, reload } = useSessionDetail(id)
  const [helpOpen, setHelpOpen] = useState(false)
  const value = useMemo<SessionContextValue | null>(
    () => (id && detail ? { sessionId: id, detail, reload } : null),
    [id, detail, reload],
  )

  if (!id) return <Navigate to="/" replace />

  if (error) return <SessionError id={id} error={error} onRetry={reload} />

  if (!value) {
    return (
      <main className="px-6 py-24 text-center text-sm text-muted-foreground" aria-busy="true">
        Loading session…
      </main>
    )
  }

  return (
    <SessionContext.Provider value={value}>
      <ReviewProvider>
        <div className="flex min-h-screen flex-col">
          <SessionHeader onHelp={() => setHelpOpen(true)} />
          <SessionLiveUpdates />
          <Outlet />
        </div>
        <SessionHotkeys onToggleHelp={() => setHelpOpen((open) => !open)} />
        <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      </ReviewProvider>
    </SessionContext.Provider>
  )
}

const REPO_MISSING_PREFIX = 'repo-missing: '

/** The path of a 422 `repo-missing: <path>` detail error (the session's repository is gone); null otherwise. */
function repoMissingPath(error: Error): string | null {
  if (!(error instanceof ApiRequestError) || error.status !== 422) return null
  const body = error.body
  const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : ''
  return message.startsWith(REPO_MISSING_PREFIX) ? message.slice(REPO_MISSING_PREFIX.length) : null
}

/**
 * The detail could not be built. The server answers with `ApiError = { error, reason? }`: a
 * missing repository (422 `repo-missing: <path>`: the session's `repo.path` is gone), a broken
 * manifest (422) or a git failure. Shown as an empty state with the server's wording, not a crash.
 */
function SessionError({ id, error, onRetry }: { id: string; error: Error; onRetry: () => void }) {
  const notFound = error instanceof ApiRequestError && error.status === 404
  const missingRepo = repoMissingPath(error)
  const title = missingRepo !== null ? 'Repository missing' : notFound ? "This session can't be opened" : "Couldn't load this session"
  const description = missingRepo !== null ? `${missingRepo} is gone or is no longer a git checkout.` : describeApiError(error)
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24" aria-labelledby="session-error-title">
      <FolderX className="size-6 text-muted-foreground" aria-hidden />
      <h1 id="session-error-title" className="text-lg font-semibold">
        {title}
      </h1>
      <p className="font-mono text-xs text-muted-foreground">{id}</p>
      <p role="alert" className="text-sm text-muted-foreground">
        {description}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
        <Button variant="ghost" render={<Link to="/" />}>
          Back to sessions
        </Button>
      </div>
    </main>
  )
}
