import { SCENARIO_STATUSES, type ArchivedSession, type Ticket } from '@scout/shared'
import { Archive, ArchiveRestore, ArrowLeft, CircleCheck, Folder, GitBranch, GitPullRequest, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { BranchChangedChip } from '@/components/session/BranchChangedChip'
import type { SessionKind } from '@/lib/paths'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatAdditions, formatDeletions, formatRelativeTime } from '@/lib/format'
import { sessionRoute } from '@/lib/paths'
import { type LiveSummary, statusSourceOf } from '@/lib/session-status'
import { SCENARIO_STATUS_LABEL, SCENARIO_STATUS_TONE } from '@/lib/scenario-status'
import { TONE_TEXT_CLASS } from '@/lib/status-tone'
import { Tag } from '@/components/ui/tag'
import { cn } from '@/lib/utils'
import { PrReviewStatusMenu } from '@/components/pr/PrReviewStatusMenu'
import { PrStatusLabel } from '@/components/pr/PrStatusLabel'
import { SessionStatusLabel } from './SessionStatusLabel'

/** Each card line stays one line, with keyboard/touch/trackpad access to clipped details. */
export function CardLine({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return <div tabIndex={0} aria-label={label} className={cn('min-w-0 overflow-x-auto overscroll-x-contain whitespace-nowrap [scrollbar-width:thin]', className)}><div className="flex w-max min-w-full items-center gap-2">{children}</div></div>
}

const KIND_LABEL = { 'code-review': 'Development', 'pr-review': 'PR review', 'test-run': 'Test run' } as const

/** Title (ticket prefix dropped) with `status` on the right; tickets below, with `statusDetail` on the right. */
export function CardIdentity({ title, tickets, status, statusDetail, kindLabel }: { title: string; tickets: readonly Ticket[]; status?: ReactNode; statusDetail?: ReactNode; kindLabel?: string }) {
  const prefix = tickets.find((ticket) => title.startsWith(`${ticket.key}: `))
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
    <CardLine label="Session name">{kindLabel && <Tag size="sm" className="shrink-0">{kindLabel}</Tag>}<span className="text-sm font-bold" title={title}>{prefix ? title.slice(prefix.key.length + 2) : title}</span></CardLine>
    <div className="col-start-2 row-start-1 justify-self-end">{status}</div>
    <TicketStrip tickets={tickets} quiet className="col-start-1 row-start-2 py-0" />
    {statusDetail && <div className="col-start-2 row-start-2 justify-self-end">{statusDetail}</div>}
  </div>
}

export function Branches({ base, current, children }: { base?: string | null; current?: string | null; children?: ReactNode }) {
  return <CardLine label="Base and current branch" className="font-mono text-[11px] text-(--tk-t)"><GitBranch aria-hidden className="size-3.5 shrink-0" /><span>{base ?? 'Not recorded'}</span><ArrowLeft aria-label="from" className="size-3 shrink-0 text-ink-muted" /><span>{current ?? 'Detached HEAD'}</span>{children}</CardLine>
}
export function CardTime({ at }: { at: string }) {
  return <time dateTime={at} title={new Date(at).toLocaleString()}>{formatRelativeTime(at)}</time>
}
/** A PR as `#number`, opening GitHub without opening the card. */
export function PrLink({ url, number, label = `PR #${number}` }: { url: string; number: number; label?: string }) {
  return <><span aria-hidden className="mx-1 text-ink-muted">|</span><a href={url} target="_blank" rel="noreferrer" aria-label={label} title={label} onClick={(event) => event.stopPropagation()} className="inline-flex shrink-0 items-center gap-1.5 cursor-pointer rounded-md px-1 py-0.5 font-sans text-xs text-info-bd underline-offset-4 hover:bg-hover hover:underline focus-visible:bg-hover focus-visible:underline"><GitPullRequest aria-hidden className="size-3.5" /><span>#{number}</span></a></>
}
export function RepoName({ path }: { path: string }) {
  return <span title={path} className="inline-flex items-center gap-1.5 text-(--tk-n)"><Folder aria-hidden className="size-3.5 shrink-0" />{path.split('/').filter(Boolean).at(-1)}</span>
}

/**
 * `showKind` labels the card Development / PR review / Test run, for lists that mix the kinds (a worktree's sessions).
 * `onDone` adds a Done button next to Archive: archives the session as finished (a merged Development session). A PR review shows its
 * review status instead (In progress, Commented, Approved), which opens a menu to change it.
 */
export function LiveSessionCard({ session, onArchive, onDone, layout = 'grid', showKind = false }: { session: LiveSummary; onArchive: (session: LiveSummary) => void; onDone?: (session: LiveSummary) => void; layout?: 'grid' | 'list'; showKind?: boolean }) {
  const navigate = useNavigate()
  const href = sessionRoute(session.kind ?? 'code-review', session.id)
  const source = statusSourceOf(session)
  const isRun = session.kind === 'test-run'
  const pr = !isRun && session.pr ? { ...session.pr, label: `PR #${session.pr.number} · ${session.pr.state}` } : null
  return <li className="min-w-0">
    <Panel role="link" tabIndex={0} aria-label={session.title} data-href={href} data-layout={layout} data-kind={session.kind ?? 'code-review'}
      onClick={() => navigate(href)}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(href) } }}
      className="h-full cursor-pointer gap-3 p-4 transition-colors hover:bg-paper-2">
      <CardIdentity title={session.title} tickets={session.tickets} kindLabel={showKind ? KIND_LABEL[session.kind ?? 'code-review'] : undefined} status={session.kind === 'pr-review' ? <PrReviewStatusMenu id={session.id} title={session.title} status={session.prStatus ?? 'in-progress'} /> : <SessionStatusLabel status={source.status} />} statusDetail={!isRun && <BranchChangedChip sessionBranch={session.repo.sessionBranch} current={session.repo.branch} />} />
      <div className={cn('flex min-w-0 flex-col gap-3 border-t-fine border-line/30 pt-3', layout === 'list' && 'md:border-t-0 md:pt-0')}>
        {isRun ? <CardLine label="Scenario counts" className="text-xs font-medium">
          <span>{source.progress.total} scenarios</span><span className="text-ink-muted">|</span>
          {SCENARIO_STATUSES.filter((status) => session.counts[status] > 0).map((status) => <span key={status} className={TONE_TEXT_CLASS[SCENARIO_STATUS_TONE[status]]}>{session.counts[status]} {SCENARIO_STATUS_LABEL[status]}</span>)}
        </CardLine> : <Branches base={session.repo.baseRef} current={session.repo.branch}>
          <span aria-hidden className="mx-1 text-ink-muted">|</span>
          <span aria-label="File changes" className="inline-flex shrink-0 items-center gap-2 font-sans text-xs font-medium text-ink"><span>{source.progress.total} files</span><span className="font-mono text-green">{formatAdditions(session.stats.additions)}</span><span className="font-mono text-red">{formatDeletions(session.stats.deletions)}</span></span>
          {pr && <PrLink {...pr} />}
        </Branches>}
      </div>
      <div className={cn('mt-auto flex min-w-0 flex-col gap-3 border-t-fine border-line/30 pt-3', layout === 'list' && '-mt-2 border-t-0 pt-0')}>

        <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-muted">
          <CardLine label="Session metadata" className="flex-1"><RepoName path={isRun ? session.run.repo : session.repo.path} /><span>·</span><CardTime at={session.updatedAt} /><span title={session.id} className="font-mono">· {session.id}</span></CardLine>
          {onDone && <Button variant="ghost" size="icon-sm" title="Done: finished or merged" aria-label={`Mark ${session.title} as done`} onClick={(event) => { event.stopPropagation(); onDone(session) }} className="shrink-0 text-green shadow-none hover:text-green"><CircleCheck aria-hidden /></Button>}
          <Button variant="ghost" size="icon-sm" title={isRun ? 'Archive test run' : 'Archive session'} aria-label={`Archive ${session.title}`} onClick={(event) => { event.stopPropagation(); onArchive(session) }} className="shrink-0 shadow-none"><Archive aria-hidden /></Button>
        </div>
      </div>
    </Panel>
  </li>
}

/** Same layout as a live card; no review counts are available until restored, and the footer shows when it was archived. */
export function ArchivedSessionCard({ session, onRestore, onDelete, kind = 'code-review', layout = 'grid' }: { session: ArchivedSession; onRestore: (session: ArchivedSession) => void; onDelete: (session: ArchivedSession) => void; kind?: SessionKind; layout?: 'grid' | 'list' }) {
  // Closed as Done, as Approved (a PR review), or just archived.
  const closedAs = session.done ? 'done' : session.prStatus === 'approved' ? 'approved' : 'archived'
  const closedLabel = { done: 'Done', approved: 'Approved', archived: 'Archived' }[closedAs]
  const status = <PrStatusLabel status={closedAs} />
  return <li aria-label={`${closedLabel} session ${session.title}`} data-done={session.done || undefined} className="min-w-0">
    <Panel data-layout={layout} className="h-full gap-3 p-4">
      <CardIdentity title={session.title} tickets={session.tickets} status={status} />
      <div className={cn('flex min-w-0 flex-col gap-3 border-t-fine border-line/30 pt-3', layout === 'list' && 'md:border-t-0 md:pt-0')}>
        {kind !== 'test-run' && <Branches base={session.repo.baseRef} current={session.repo.branch} />}
      </div>
      <div className={cn('mt-auto flex min-w-0 items-center gap-2 border-t-fine border-line/30 pt-3', layout === 'list' && '-mt-2 border-t-0 pt-0')}>
        <CardLine label="Session metadata" className="flex-1 text-[11px] text-ink-muted"><RepoName path={session.repo.path} /><span>·</span><span title={`Created ${new Date(session.createdAt).toLocaleString()} · updated ${new Date(session.updatedAt).toLocaleString()}`}>{closedLabel} <CardTime at={session.archivedAt} /></span><span title={session.id} className="font-mono">· {session.id}</span></CardLine>
        <Button variant="ghost" size="icon-sm" onClick={() => onRestore(session)} title="Restore" aria-label={`Restore ${session.title}`} className="shrink-0 shadow-none"><ArchiveRestore aria-hidden /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onDelete(session)} title="Delete permanently" aria-label={`Delete ${session.title}`} className="shrink-0 text-ink-muted hover:bg-red-solid hover:text-on-red"><Trash2 aria-hidden /></Button>
      </div>
    </Panel>
  </li>
}
