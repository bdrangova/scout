import type { AssignedPr, LocalPrReview, PrReviewState } from '@scout/shared'
import { Archive, CircleCheck, ExternalLink, EyeOff, GitPullRequest, Trash2, Undo2, Users, X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { DeleteSessionDialog } from '@/components/sessions/DeleteSessionDialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { createPendingPr, ignorePr, prSessionRoute, publishPrReviewCommand, removePendingPr, reopenPr } from '@/lib/github'
import { isClosedPr } from '@/lib/pr-status'
import { describeApiError } from '@/lib/runs'
import { cn } from '@/lib/utils'
import { PrReviewStatusMenu } from './PrReviewStatusMenu'
import { PrStatusLabel } from './PrStatusLabel'

const REVIEW_TONE: Record<PrReviewState, 'ok' | 'err' | 'neutral'> = { approved: 'ok', 'changes-requested': 'err', commented: 'neutral', dismissed: 'neutral' }
const REVIEW_LABEL: Record<PrReviewState, string> = { approved: 'approved', 'changes-requested': 'changes requested', commented: 'commented', dismissed: 'dismissed' }

/** A ghost icon button with a tooltip; `label` is its accessible name. */
function IconAction({ label, tip, disabled, onClick, className, children }: { label: string; tip: string; disabled: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} aria-busy={disabled} onClick={(event) => { event.stopPropagation(); onClick() }} className={className} />}>{children}</TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  )
}

/** A labelled line of chips; nothing when empty. */
function People({ label, children }: { label: string; children: ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <div aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[11px] font-semibold text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

/** Who is asked to review (people, then teams) and who already reviewed, with their verdict. */
function Reviewers({ pr }: { pr: AssignedPr }) {
  const assigned = [
    ...pr.requested.users.map((login) => <Tag key={login} size="sm" pill mono tone="info">{login}</Tag>),
    ...pr.requested.teams.map((team) => <Tag key={team} size="sm" pill mono tone="info" title={team}><Users aria-hidden />{team.split('/').at(-1)}</Tag>),
  ]
  const reviewed = pr.reviews.map((review) => (
    <Tag key={review.login} size="sm" pill mono tone={REVIEW_TONE[review.state]} title={`${review.login}: ${REVIEW_LABEL[review.state]}`}>{review.login} · {REVIEW_LABEL[review.state]}</Tag>
  ))
  if (assigned.length === 0 && reviewed.length === 0) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      <People label="Assigned">{assigned}</People>
      <People label="Reviewed">{reviewed}</People>
    </div>
  )
}

/** Runs a row action with a busy flag; a failure is a toast. */
function useRowAction(): { busy: boolean; run: (action: () => Promise<void>, failure: string) => void } {
  const [busy, setBusy] = useState(false)
  function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    action().then(
      () => setBusy(false),
      (err: unknown) => {
        toast.error(failure, { description: describeApiError(err) })
        setBusy(false)
      },
    )
  }
  return { busy, run }
}

/**
 * The row frame: details on the left; on the right the status (`statusMark`) above the action icons. Clicking anywhere (or Enter
 * on it) runs `onOpen` when there is one; links and buttons inside keep their own clicks. A live review gets a blue edge while open.
 */
function RowShell({ label, onOpen, live, status, statusMark, children, actions }: { label: string; onOpen: (() => void) | null; live: boolean; status: string; statusMark: ReactNode; children: ReactNode; actions: ReactNode }) {
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (onOpen && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onOpen()
    }
  }
  return (
    <li
      role={onOpen ? 'link' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={label}
      data-status={status}
      onClick={onOpen ?? undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-w-0 items-start gap-4 rounded-2xl border-fine border-line bg-surface px-4 py-3',
        onOpen && 'cursor-pointer transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-focus',
        live && 'border-l-4 border-l-blue',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
      {/* Status on top, the actions under it, both on the right. */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {statusMark}
        <TooltipProvider delay={150}>
          <div className="-mr-1.5 flex items-center gap-0.5">{actions}</div>
        </TooltipProvider>
      </div>
    </li>
  )
}

/** A live review's status opens the status menu while open (not on your own PRs, where it is never set by hand); otherwise it is a plain label. */
function RowStatus({ status, session, title, editable }: { status: AssignedPr['status']; session: { id: string; state: string } | null; title: string; editable: boolean }) {
  if (editable && session?.state === 'live' && (status === 'in-progress' || status === 'commented')) {
    return <PrReviewStatusMenu id={session.id} title={title} status={status} />
  }
  return <PrStatusLabel status={status} className="py-1" />
}

/** Ignore on an open PR, Reopen on a closed one: all keyed by the PR's URL. */
function PrMarkActions({ url, title, closed, busy, run, onChanged }: { url: string; title: string; closed: boolean; busy: boolean; run: (action: () => Promise<void>, failure: string) => void; onChanged: () => void }) {
  if (closed) {
    // Reopen undoes whatever closed it: Ignore, your approval, or an archived review session (restored).
    return <IconAction label={`Reopen ${title}`} tip="Reopen: move it back to Open" disabled={busy} onClick={() => run(async () => { await reopenPr(url); onChanged() }, "Couldn't reopen the PR")}><Undo2 aria-hidden /></IconAction>
  }
  return <IconAction label={`Ignore ${title}`} tip="Ignore (nothing changes on GitHub)" disabled={busy} onClick={() => run(async () => { await ignorePr(url); toast.success('Ignored', { description: title }); onChanged() }, "Couldn't ignore the PR")}><EyeOff aria-hidden /></IconAction>
}

/** Deletes the row's review session for good, behind a confirmation. The PR itself stays listed, without a session. */
function DeleteSessionAction({ id, title, onChanged }: { id: string; title: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  // The dialog's events bubble to the row through React: keep them from opening it.
  return (
    <span className="contents" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <IconAction label={`Delete the session for ${title}`} tip="Delete the session permanently" disabled={false} onClick={() => setOpen(true)} className="hover:text-red"><Trash2 aria-hidden /></IconAction>
      <DeleteSessionDialog id={id} title={title} open={open} onOpenChange={setOpen} onDeleted={onChanged} />
    </span>
  )
}

/**
 * One GitHub PR: title (to GitHub), its status, author and size, who is assigned and who reviewed (`showReviewers`; off in
 * "Assigned to me"). Clicking the row opens its review session, or for an open PR without one starts it: a placeholder page with
 * the review command, which is copied. Ignore on an open PR, Reopen on a closed one; `onChanged` reloads the list.
 */
export function AssignedPrRow({ pr, viewer, showReviewers, onChanged }: { pr: AssignedPr; viewer: string | null; showReviewers: boolean; onChanged: () => void }) {
  const navigate = useNavigate()
  const { busy, run } = useRowAction()
  const session = pr.session
  const closed = isClosedPr(pr.status)
  const mine = viewer?.toLowerCase()
  // Your own PR's status follows GitHub only; there is nothing to set by hand.
  const yours = pr.author.toLowerCase() === mine
  const youApproved = mine !== undefined && pr.reviews.findLast((review) => review.login.toLowerCase() === mine)?.state === 'approved'

  function start() {
    // Copied while the click still counts as a user gesture, so it is ready to paste into Claude.
    void navigator.clipboard?.writeText(publishPrReviewCommand(pr.url)).then(
      () => toast.success('Review command copied'),
      () => undefined,
    )
    run(async () => {
      await navigate(prSessionRoute(await createPendingPr(pr.url)))
    }, "Couldn't start the session")
  }

  // An Approved PR's session is archived; it still opens.
  const onOpen = session ? () => void navigate(prSessionRoute(session)) : !closed && !busy ? start : null
  return (
    <RowShell label={session ? `Open the review of ${pr.title}` : `Start a review of ${pr.title}`} onOpen={onOpen} live={session?.state === 'live' && !closed} status={pr.status} statusMark={<RowStatus status={pr.status} session={session} title={pr.title} editable={!yours} />}
      actions={
        <>
          <PrMarkActions url={pr.url} title={pr.title} closed={closed} busy={busy} run={run} onChanged={onChanged} />
          {session && session.state !== 'pending' && <DeleteSessionAction id={session.id} title={pr.title} onChanged={onChanged} />}
        </>
      }>
      <div className="flex min-w-0 items-center gap-2">
        <a href={pr.url} target="_blank" rel="noreferrer" title={`${pr.repo}#${pr.number} on GitHub`} onClick={(event) => event.stopPropagation()} className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold underline-offset-4 hover:underline">
          <span className="truncate">{pr.title}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-muted" />
        </a>
        {pr.isDraft && <Tag size="sm" tone="warn" className="shrink-0">Draft</Tag>}
        {session?.state === 'pending' && <Tag size="sm" pill tone="neutral" className="shrink-0">Not started</Tag>}
        {youApproved && <Tag size="sm" pill tone="ok" className="shrink-0 gap-1"><CircleCheck aria-hidden className="size-3" />You approved</Tag>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
        <span>by {pr.author}</span>
        <span aria-label="Size" className="inline-flex gap-1.5 font-mono"><span className="text-green">{formatAdditions(pr.additions)}</span><span className="text-red">{formatDeletions(pr.deletions)}</span></span>
      </div>
      {showReviewers && <Reviewers pr={pr} />}
    </RowShell>
  )
}

/**
 * One of "Other": a review you started that no section above covers. The title opens the PR on GitHub in a new tab; clicking
 * elsewhere opens its session or placeholder page (an archived review must be reopened first). With a PR it has the PR's Ignore,
 * and Reopen; without one, Archive (or Remove for a placeholder) and Reopen.
 */
export function LocalPrRow({ row, onChanged }: { row: LocalPrReview; onChanged: () => void }) {
  const navigate = useNavigate()
  const { busy, run } = useRowAction()
  const { session, pr } = row
  const closed = isClosedPr(row.status)
  const onOpen = session.state === 'archived' ? null : () => void navigate(prSessionRoute(session))

  let actions: ReactNode
  if (pr !== null) actions = <PrMarkActions url={pr.url} title={row.title} closed={closed} busy={busy} run={run} onChanged={onChanged} />
  else if (session.state === 'archived') actions = <IconAction label={`Reopen ${row.title}`} tip="Reopen: restore the review" disabled={busy} onClick={() => run(async () => { await unarchiveSession(session.id).catch((err: unknown) => { throw new Error(archiveErrorMessage(err)) }); onChanged() }, "Couldn't reopen the review")}><Undo2 aria-hidden /></IconAction>
  else if (session.state === 'pending') actions = <IconAction label={`Remove ${row.title}`} tip="Remove this not-started review" disabled={busy} onClick={() => void removePendingPr(session.id, onChanged)}><X aria-hidden /></IconAction>
  else actions = <IconAction label={`Archive ${row.title}`} tip="Archive the review" disabled={busy} onClick={() => run(async () => { await archiveSession(session.id); onChanged() }, "Couldn't archive the review")}><Archive aria-hidden /></IconAction>

  if (session.state !== 'pending') {
    actions = (
      <>
        {actions}
        <DeleteSessionAction id={session.id} title={row.title} onChanged={onChanged} />
      </>
    )
  }

  return (
    <RowShell label={onOpen ? `Open the review of ${row.title}` : row.title} onOpen={onOpen} live={session.state === 'live' && !closed} status={row.status} statusMark={<RowStatus status={row.status} session={session} title={row.title} editable />} actions={actions}>
      <div className="flex min-w-0 items-center gap-2">
        {pr === null ? (
          <span className="truncate text-sm font-bold" title={row.title}>{row.title}</span>
        ) : (
          <a href={pr.url} target="_blank" rel="noreferrer" title={`${pr.repo}#${pr.number} on GitHub`} onClick={(event) => event.stopPropagation()} className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold underline-offset-4 hover:underline">
            <span className="truncate">{row.title}</span>
            <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-muted" />
          </a>
        )}
        {session.state === 'pending' && <Tag size="sm" pill tone="neutral" className="shrink-0">Not started</Tag>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
        {pr === null ? (
          <Tag size="sm" pill tone="neutral">Local</Tag>
        ) : (
          <span className="inline-flex items-center gap-1.5"><GitPullRequest aria-hidden className="size-3.5" />{pr.repo} #{pr.number}</span>
        )}
      </div>
    </RowShell>
  )
}
