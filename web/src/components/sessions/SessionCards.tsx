import { SCENARIO_STATUSES, type ArchivedSession, type Ticket } from '@review-dash/shared'
import { Archive, ArchiveRestore, ArrowLeft, Folder, GitBranch, GitPullRequest, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatAdditions, formatDeletions, formatRelativeTime } from '@/lib/format'
import { sessionRoute } from '@/lib/paths'
import { reviewStatusOf, runChipOf, type LiveSummary, statusSourceOf } from '@/lib/session-status'
import { SCENARIO_STATUS_LABEL, SCENARIO_STATUS_TONE } from '@/lib/scenario-status'
import { TONE_TEXT_CLASS } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { SessionStatusLabel } from './SessionStatusLabel'

/** Each card line stays one line, with keyboard/touch/trackpad access to clipped details. */
function CardLine({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return <div tabIndex={0} aria-label={label} className={cn('min-w-0 overflow-x-auto overscroll-x-contain whitespace-nowrap [scrollbar-width:thin]', className)}><div className="flex w-max min-w-full items-center gap-2">{children}</div></div>
}

function CardIdentity({ title, tickets, status }: { title: string; tickets: readonly Ticket[]; status?: ReactNode }) {
  const prefix = tickets.find((ticket) => title.startsWith(`${ticket.key}: `))
  return <div className="flex min-w-0 flex-col gap-2.5">
    <div className="flex min-w-0 items-center gap-3">
      <CardLine label="Session name" className="flex-1"><span className="text-sm font-bold" title={title}>{prefix ? title.slice(prefix.key.length + 2) : title}</span></CardLine>
      {status}
    </div>
    <TicketStrip tickets={tickets} quiet className="py-0" />
  </div>
}

function Branches({ base, current }: { base?: string | null; current?: string | null }) {
  return <CardLine label="Base and current branch" className="font-mono text-[11px] text-(--tk-t)"><GitBranch aria-hidden className="size-3.5 shrink-0" /><span>{base ?? 'Not recorded'}</span><ArrowLeft aria-label="from" className="size-3 shrink-0 text-ink-muted" /><span>{current ?? 'Detached HEAD'}</span></CardLine>
}
function CardTime({ at }: { at: string }) {
  return <time dateTime={at} title={new Date(at).toLocaleString()}>{formatRelativeTime(at)}</time>
}
function RepoName({ path }: { path: string }) {
  return <span title={path} className="inline-flex items-center gap-1.5 text-(--tk-n)"><Folder aria-hidden className="size-3.5 shrink-0" />{path.split('/').filter(Boolean).at(-1)}</span>
}

export function LiveSessionCard({ session, onArchive }: { session: LiveSummary; onArchive: (session: LiveSummary) => void }) {
  const navigate = useNavigate()
  const href = sessionRoute(session.kind ?? 'code-review', session.id)
  const source = statusSourceOf(session)
  const isRun = session.kind === 'test-run'
  const run = runChipOf(session.status)
  return <li className="min-w-0">
    <Panel role="link" tabIndex={0} aria-label={session.title} data-href={href} data-layout="grid" data-kind={session.kind ?? 'code-review'}
      onClick={() => navigate(href)}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(href) } }}
      className="h-full cursor-pointer gap-3 p-4 transition-colors hover:bg-paper-2">
      <CardIdentity title={session.title} tickets={session.tickets} status={<SessionStatusLabel status={reviewStatusOf(source)} />} />
      <div className="flex min-w-0 flex-col gap-3 border-t-fine border-line pt-3">
        {isRun ? <CardLine label="Feature and area" className="text-xs text-(--tk-t)"><span>{session.run.feature || '—'}</span><span className="text-ink-muted">/</span><span>{session.run.area || '—'}</span></CardLine> : <Branches base={session.repo.baseRef} current={session.repo.branch} />}
        <CardLine label={isRun ? 'Scenario counts' : 'File changes'} className="text-xs font-medium">
          <span>{source.progress.total} {isRun ? 'scenarios' : 'files'}</span><span className="text-ink-muted">|</span>
          {isRun ? SCENARIO_STATUSES.filter((status) => session.counts[status] > 0).map((status) => <span key={status} className={TONE_TEXT_CLASS[SCENARIO_STATUS_TONE[status]]}>{session.counts[status]} {SCENARIO_STATUS_LABEL[status]}</span>) : <><span className="font-mono text-green">{formatAdditions(session.stats.additions)}</span><span className="font-mono text-red">{formatDeletions(session.stats.deletions)}</span></>}
        </CardLine>
      </div>
      <div className="mt-auto flex min-w-0 flex-col gap-3 border-t-fine border-line pt-3">
        {!isRun && <CardLine label="Pull request" className="text-xs text-info-bd">{session.pr ? <a href={session.pr.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1.5 hover:underline"><GitPullRequest aria-hidden className="size-3.5" />PR #{session.pr.number} · {session.pr.state}</a> : <span className="text-ink-muted">No pull request</span>}</CardLine>}
        {run && <SessionStatusLabel status={run === 'working' ? 'agent-working' : 'run-failed'} />}
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-muted">
          <CardLine label="Session metadata" className="flex-1"><RepoName path={isRun ? session.run.path : session.repo.path} /><span>·</span><CardTime at={session.updatedAt} /><span title={session.id} className="font-mono">· {session.id}</span></CardLine>
          <Button variant="ghost" size="icon-sm" title={isRun ? 'Archive test run' : 'Archive session'} aria-label={`Archive ${session.title}`} onClick={(event) => { event.stopPropagation(); onArchive(session) }} className="shrink-0 shadow-none"><Archive aria-hidden /></Button>
        </div>
      </div>
    </Panel>
  </li>
}

/** Archive metadata stays compact; no review counts are available until restored. */
export function ArchivedSessionCard({ session, onRestore, onDelete }: { session: ArchivedSession; onRestore: (session: ArchivedSession) => void; onDelete: (session: ArchivedSession) => void }) {
  return <li aria-label={`Archived session ${session.title}`} className="min-w-0">
    <Panel data-layout="grid" className="h-full gap-3 p-4">
      <CardIdentity title={session.title} tickets={session.tickets} status={<span className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><Archive aria-hidden className="size-3.5" />Archived</span>} />
      <div className="border-t-fine border-line pt-3"><Branches base={session.repo.baseRef} current={session.repo.branch} /></div>
      <CardLine label="Archive dates" className="text-[11px] text-ink-muted"><span>Created <CardTime at={session.createdAt} /></span><span>· Updated <CardTime at={session.updatedAt} /></span><span>· Archived <CardTime at={session.archivedAt} /></span></CardLine>
      <div className="mt-auto flex min-w-0 items-center gap-2 border-t-fine border-line pt-3">
        <CardLine label="Session metadata" className="flex-1 text-[11px] text-ink-muted"><RepoName path={session.repo.path} /><span title={session.id} className="font-mono">· {session.id}</span></CardLine>
        <Button size="sm" onClick={() => onRestore(session)} aria-label={`Restore ${session.title}`}><ArchiveRestore aria-hidden />Restore</Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onDelete(session)} title="Delete permanently" aria-label={`Delete ${session.title}`} className="shrink-0 text-ink-muted hover:bg-red-solid hover:text-on-red"><Trash2 aria-hidden /></Button>
      </div>
    </Panel>
  </li>
}
