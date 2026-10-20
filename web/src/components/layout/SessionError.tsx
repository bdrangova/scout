import { ArchiveRestore, ArrowLeft, FolderX, RotateCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel, PanelBody, PanelFooter, PanelHeader } from '@/components/ui/panel'
import { ApiRequestError } from '@/lib/api'
import { archiveErrorMessage, unarchiveSession } from '@/lib/archive'
import { useArchivedSessions } from '@/lib/hooks'
import { describeApiError } from '@/lib/runs'

const REPO_MISSING_PREFIX = 'repo-missing: '

/** The path of a 422 `repo-missing: <path>` detail error (the session's repository is gone); null otherwise. */
function repoMissingPath(error: Error): string | null {
  if (!(error instanceof ApiRequestError) || error.status !== 422) return null
  const body = error.body
  const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : ''
  return message.startsWith(REPO_MISSING_PREFIX) ? message.slice(REPO_MISSING_PREFIX.length) : null
}

function ErrorPanel({ title, id, children, actions }: { title: string; id: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-24" aria-labelledby="session-error-title">
      <Panel>
        <PanelHeader>
          <FolderX className="size-4 text-ink-muted" aria-hidden />
          <h1 id="session-error-title" className="m-0 text-[15px] font-bold">
            {title}
          </h1>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="m-0 font-mono text-xs text-ink-muted">{id}</p>
          {children}
        </PanelBody>
        <PanelFooter className="flex justify-end gap-2.5">
          <Button variant="ghost" render={<Link to="/" />}>
            <ArrowLeft aria-hidden />
            Back to sessions
          </Button>
          {actions}
        </PanelFooter>
      </Panel>
    </main>
  )
}

function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <Notice tone="err" className="max-w-full items-start [&>span]:mt-0.5">
      <span className="min-w-0 break-words">{children}</span>
    </Notice>
  )
}

/** A session id that is not under `sessions/` but is under `archive/`: offer to bring it back. */
function ArchivedSessionPanel({ id, onRestored }: { id: string; onRestored: () => void }) {
  const [busy, setBusy] = useState(false)
  async function unarchive() {
    setBusy(true)
    try {
      await unarchiveSession(id)
      onRestored()
    } catch (reason: unknown) {
      toast.error(archiveErrorMessage(reason))
      setBusy(false)
    }
  }
  return (
    <ErrorPanel
      title="This session is archived"
      id={id}
      actions={
        <Button variant="primary" onClick={() => void unarchive()} disabled={busy} aria-busy={busy}>
          <ArchiveRestore aria-hidden />
          Unarchive
        </Button>
      }
    >
      <p className="m-0 text-[13px] font-medium text-ink-muted">Archived sessions are not reviewable. Unarchive it to open the review again.</p>
    </ErrorPanel>
  )
}

function NotFoundPanel({ id, error, onRetry }: { id: string; error: Error; onRetry: () => void }) {
  const { archived } = useArchivedSessions()
  if (archived?.some((session) => session.id === id)) return <ArchivedSessionPanel id={id} onRestored={onRetry} />
  return <FailurePanel id={id} error={error} onRetry={onRetry} title="This session can't be opened" />
}

function FailurePanel({ id, error, onRetry, title }: { id: string; error: Error; onRetry: () => void; title?: string }) {
  const missingRepo = repoMissingPath(error)
  const heading = missingRepo !== null ? 'Repository missing' : (title ?? "Couldn't load this session")
  const description = missingRepo !== null ? `${missingRepo} is gone or is no longer a git checkout.` : describeApiError(error)
  return (
    <ErrorPanel
      title={heading}
      id={id}
      actions={
        <Button variant="primary" onClick={onRetry}>
          <RotateCw aria-hidden />
          Retry
        </Button>
      }
    >
      <ErrorNotice>{description}</ErrorNotice>
    </ErrorPanel>
  )
}

/**
 * The detail could not be built. The server answers with `ApiError = { error, reason? }`: a
 * missing repository (422 `repo-missing: <path>`: the session's `repo.path` is gone), a broken
 * manifest (422) or a git failure. A 404 may be an archived session (offers Unarchive). Shown as
 * a panel with the server's wording, not a crash.
 */
export function SessionError({ id, error, onRetry }: { id: string; error: Error; onRetry: () => void }) {
  const notFound = error instanceof ApiRequestError && error.status === 404
  return notFound ? <NotFoundPanel id={id} error={error} onRetry={onRetry} /> : <FailurePanel id={id} error={error} onRetry={onRetry} />
}
