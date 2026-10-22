import type { ArchivedSession, Ticket } from '@review-dash/shared'
import { Archive, ArchiveRestore, Folder, GitBranch, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { BranchChangedChip } from '@/components/session/BranchChangedChip'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatAdditions, formatDeletions, formatRelativeTime } from '@/lib/format'
import { sessionRoute } from '@/lib/paths'
import { type LiveSummary, statusSourceOf } from '@/lib/session-status'
import { SCENARIO_STATUS_LABEL, SCENARIO_STATUS_TONE } from '@/lib/scenario-status'
import { SCENARIO_STATUSES } from '@review-dash/shared'
import { TONE_TEXT_CLASS } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { SessionReviewState } from './SessionReviewState'

interface Fact { label: string; value: ReactNode; full?: boolean; className?: string }

function CardFacts({ items }: { items: readonly Fact[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3">
      {items.map(({ label, value, full, className }) => (
        <div key={label} className={cn('min-w-0', full && 'col-span-2')}>
          <dt className="mb-1 text-[11px] font-medium text-ink-muted">{label}</dt>
          <dd className={cn('m-0 text-xs font-semibold break-words', className)}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CardIdentity({ title, tickets }: { title: string; tickets: readonly Ticket[] }) {
  const prefix = tickets.find((ticket) => title.startsWith(`${ticket.key}: `))
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <span className="text-base leading-snug font-bold break-words" title={title}>{prefix ? title.slice(prefix.key.length + 2) : title}</span>
      <TicketStrip tickets={tickets} quiet className="flex-wrap overflow-x-visible py-0" />
    </div>
  )
}

function CardPath({ children, branch = false }: { children: ReactNode; branch?: boolean }) {
  const Icon = branch ? GitBranch : Folder
  return <span className={cn('flex items-start gap-1.5', branch ? 'text-(--tk-t)' : 'text-(--tk-n)')}><Icon aria-hidden className="mt-px size-3.5 shrink-0" /><span className="min-w-0 font-mono text-[11px] leading-relaxed break-all">{children}</span></span>
}

function CardTime({ at }: { at: string }) {
  return <time dateTime={at} title={new Date(at).toLocaleString()}>{formatRelativeTime(at)}</time>
}

/** Full summary details, laid out vertically; opening and archiving match the compact rows. */
export function LiveSessionCard({ session, onArchive }: { session: LiveSummary; onArchive: (session: LiveSummary) => void }) {
  const navigate = useNavigate()
  const href = sessionRoute(session.kind ?? 'code-review', session.id)
  const source = statusSourceOf(session)
  const isRun = session.kind === 'test-run'
  const stats: Fact[] = [
    { label: isRun ? 'Scenarios' : 'Files', value: source.progress.total },
    { label: 'Reviewed', value: `${source.progress.reviewed} / ${source.progress.total}` },
    { label: 'Open comments', value: session.openComments },
  ]
  if (isRun) {
    for (const status of SCENARIO_STATUSES) stats.push({ label: SCENARIO_STATUS_LABEL[status], value: session.counts[status], className: TONE_TEXT_CLASS[SCENARIO_STATUS_TONE[status]] })
  } else {
    stats.push({ label: 'Changes', value: <span className="inline-flex flex-wrap gap-2 font-mono tabular-nums"><span className="text-green">{formatAdditions(session.stats.additions)}</span><span className="text-red">{formatDeletions(session.stats.deletions)}</span></span> })
  }
  const location: Fact[] = isRun ? [
    { label: 'Feature', value: session.run.feature || '—' },
    { label: 'Area', value: session.run.area || '—' },
    { label: 'Run folder', value: <CardPath>{session.run.path}</CardPath>, full: true },
  ] : [
    { label: 'Repository', value: <CardPath>{session.repo.path}</CardPath>, full: true },
    { label: 'Current branch', value: <CardPath branch>{session.repo.branch ?? 'Detached HEAD'}</CardPath> },
    { label: 'Base branch', value: <CardPath branch>{session.repo.baseRef}</CardPath> },
  ]
  return (
    <li className="min-w-0">
      <Panel role="link" tabIndex={0} aria-label={session.title} data-href={href} data-layout="grid" data-kind={session.kind ?? 'code-review'}
        onClick={() => navigate(href)}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(href) } }}
        className="h-full cursor-pointer gap-5 overflow-visible p-5 transition-colors hover:bg-paper-2">
        <CardIdentity title={session.title} tickets={session.tickets} />
        <SessionReviewState session={session} showProgress={false} />
        <div className="border-t-fine border-line pt-4"><CardFacts items={location} /></div>
        {!isRun && <BranchChangedChip sessionBranch={session.repo.sessionBranch} current={session.repo.branch} />}
        <div className="border-t-fine border-line pt-4"><CardFacts items={stats} /></div>
        {!isRun && session.pr && (
          <a href={session.pr.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="text-xs font-medium text-info-bd underline-offset-4 hover:underline">PR #{session.pr.number} · {session.pr.state} · {session.prComments?.open ?? 0} open threads</a>
        )}
        <div className="mt-auto flex flex-col gap-3 border-t-fine border-line pt-3">
          <span className="font-mono text-[10px] leading-relaxed break-all text-ink-muted">{session.id}</span>
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>Updated <CardTime at={session.updatedAt} /></span>
            <Button variant="ghost" size="sm" title={isRun ? 'Archive test run' : 'Archive session'} aria-label={`Archive ${session.title}`} onClick={(event) => { event.stopPropagation(); onArchive(session) }} className="shadow-none"><Archive aria-hidden />Archive</Button>
          </div>
        </div>
      </Panel>
    </li>
  )
}

/** Archives have manifest metadata only; restoring remains the action that opens them for review. */
export function ArchivedSessionCard({ session, onRestore, onDelete }: { session: ArchivedSession; onRestore: (session: ArchivedSession) => void; onDelete: (session: ArchivedSession) => void }) {
  return (
    <li aria-label={`Archived session ${session.title}`} className="min-w-0">
      <Panel data-layout="grid" className="h-full gap-5 p-5">
        <CardIdentity title={session.title} tickets={session.tickets} />
        <CardFacts items={[
          { label: 'Repository / working folder', value: <CardPath>{session.repo.path}</CardPath>, full: true },
          { label: 'Branch', value: <CardPath branch>{session.repo.branch ?? 'Not recorded'}</CardPath> },
          { label: 'Base branch', value: <CardPath branch>{session.repo.baseRef ?? 'Not recorded'}</CardPath> },
        ]} />
        <div className="border-t-fine border-line pt-4"><CardFacts items={[
          { label: 'Created', value: <CardTime at={session.createdAt} /> },
          { label: 'Last updated', value: <CardTime at={session.updatedAt} /> },
          { label: 'Archived', value: <CardTime at={session.archivedAt} />, full: true },
        ]} /></div>
        <div className="mt-auto flex flex-col gap-3 border-t-fine border-line pt-3">
          <span className="font-mono text-[10px] leading-relaxed break-all text-ink-muted">{session.id}</span>
          <div className="flex items-center justify-between gap-3">
            <Button size="sm" onClick={() => onRestore(session)} aria-label={`Restore ${session.title}`}><ArchiveRestore aria-hidden />Restore</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onDelete(session)} title="Delete permanently" aria-label={`Delete ${session.title}`} className="text-ink-muted hover:bg-red-solid hover:text-on-red"><Trash2 aria-hidden /></Button>
          </div>
        </div>
      </Panel>
    </li>
  )
}
