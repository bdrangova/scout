import { ChevronLeft, ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import type { PendingPrReviewDetail } from '@scout/shared'
import { BranchPair } from '@/components/common/BranchRef'
import { CopyButton } from '@/components/common/CopyButton'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ErrorState, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Panel, PanelBody } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { ApiRequestError, apiGet } from '@/lib/api'
import { fetchPendingPr, publishPrReviewCommand, removePendingPr } from '@/lib/github'
import { useAsync } from '@/lib/hooks'
import { otherKindRoute, repoName } from '@/lib/paths'
import { desktopDeepLink } from '@/lib/runs'
import { useHotkeys } from '@/lib/useHotkeys'
import { useStoreEvents } from '@/lib/useStoreEvents'

const BACK_ROUTE = '/pr?tab=active'

function NotFound() {
  return (
    <Panel className="items-center gap-2 border-dashed px-6 py-14 text-center">
      <p className="m-0 text-base font-bold">This PR review isn't here any more</p>
      <p className="m-0 text-[13px] text-ink-muted">It may have been removed.</p>
      <Link to={BACK_ROUTE} className={buttonVariants({ size: 'sm' })}>Back to active sessions</Link>
    </Panel>
  )
}

/** The placeholder is gone: when a session now has its id it was claimed by `scout-pr-review`, so go there. */
function Claimed({ id }: { id: string }) {
  const session = useAsync(`pr-pending-claimed:${id}`, () => apiGet<unknown>(`/sessions/${encodeURIComponent(id)}`))
  if (session.data !== null) return <Navigate to={`/s/${encodeURIComponent(id)}`} replace />
  return session.loading ? <LoadingState label="Looking for the session…" /> : <NotFound />
}

function ReviewPanel({ detail }: { detail: PendingPrReviewDetail }) {
  const command = publishPrReviewCommand(detail.pr.url)
  return (
    <Panel role="region" aria-label="Start the review">
      <PanelBody className="flex flex-col gap-3 text-[13.5px] leading-[1.45]">
        <p className="m-0">Open Claude Code in a checkout of {detail.pr.repo}, then run:</p>
        <div className="flex min-w-0 items-center gap-1.5">
          <code className="min-w-0 truncate rounded-md border-fine border-line bg-paper-2 px-2 py-1 font-mono text-xs" title={command}>{command}</code>
          <CopyButton value={command} label="command" />
        </div>
        {detail.checkouts.length > 0 && (
          <div className="flex flex-col gap-2 border-t-fine border-line/30 pt-3">
            <span className="text-xs font-semibold text-ink-muted">Or start it in a checkout on this Mac</span>
            <ul aria-label="Checkouts" className="m-0 flex list-none flex-col gap-1.5 p-0">
              {detail.checkouts.map((path) => (
                <li key={path} className="flex min-w-0 items-center gap-2">
                  <a href={desktopDeepLink(path, command)} className={buttonVariants({ size: 'sm' })}><ExternalLink aria-hidden />Open in Claude Desktop</a>
                  <code className="min-w-0 truncate font-mono text-xs text-ink-muted" title={path}>{repoName(path)}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

function Detail({ detail, onRemove }: { detail: PendingPrReviewDetail; onRemove: () => void }) {
  const { pr } = detail
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h1 className="m-0 min-w-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em] break-words">{pr.title}</h1>
            {pr.isDraft && <Tag tone="warn">Draft</Tag>}
          </div>
          <Button variant="reject" size="sm" className="shrink-0" onClick={onRemove}><Trash2 aria-hidden />Remove</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
          <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline-offset-4 hover:underline">{pr.repo}#{pr.number}<ExternalLink aria-hidden className="size-3" /></a>
          <span>by {pr.author}</span>
          <BranchPair baseRef={pr.baseRef} branch={pr.headRef} />
        </div>
      </div>
      <ReviewPanel detail={detail} />
    </div>
  )
}

/** `/pr/p/:id`: a not-started PR review. Its facts and how to start the review; it becomes `/s/:id` once `scout-pr-review` claims it. */
export function PendingPrPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const state = useAsync(`pr-pending:${id}`, () => fetchPendingPr(id))
  useHotkeys({ toggleKind: () => navigate(otherKindRoute('pr-review')) })
  useStoreEvents({
    'pr-pending.updated': state.reload,
    'session.added': (event) => {
      if (event.sessionId === id) void navigate(`/s/${encodeURIComponent(id)}`, { replace: true })
    },
  })
  const missing = state.error instanceof ApiRequestError && state.error.status === 404

  return (
    <div data-page="pending-pr" className="flex min-h-screen flex-col">
      <SessionsBar kind="pr-review" onHelp={() => setHelpOpen((open) => !open)} />
      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <Link to={BACK_ROUTE} className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-ink-muted hover:text-ink"><ChevronLeft aria-hidden className="size-4" />Active sessions</Link>
          {missing ? (
            <Claimed id={id} />
          ) : state.error ? (
            <ErrorState message={`Couldn't load the PR review: ${state.error.message}`} onRetry={state.reload} />
          ) : state.data === null ? (
            <LoadingState label="Loading PR review…" />
          ) : (
            <Detail detail={state.data} onRemove={() => void removePendingPr(id, () => void navigate(BACK_ROUTE))} />
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
