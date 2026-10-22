import type { SessionSummary } from '@review-dash/shared'
import { reviewStatusOf, runChipOf, statusPill, statusWord } from '@/lib/session-status'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { ReviewProgress } from './ReviewProgress'

/** Dashboard language explains the submitted decision without changing lifecycle semantics. */
export function SessionReviewState({ session }: { session: SessionSummary }) {
  const status = reviewStatusOf(session)
  const spec = STATUS_TONE.session(status)
  const Icon = spec.icon
  const run = runChipOf(session.status)
  const runSpec = run ? STATUS_TONE.session(run === 'working' ? 'agent-working' : 'run-failed') : null
  const RunIcon = runSpec?.icon
  const label = status === 'sent' ? 'Review sent' : statusWord({ ...session, status })
  const decision = status === 'sent' ? session.lastSend?.decision : null
  const decisionLabel = decision === 'approve' ? 'Approval submitted' : decision === 'request-changes' ? 'Changes requested' : decision === 'reject' ? 'Rejected' : null
  const description = statusPill({ ...session, status }).label
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span role="status" aria-label={decisionLabel ? `${label} · ${decisionLabel}` : description} data-status={status} title={description} className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', spec.textClass)}>
        <Icon aria-hidden className="size-3.5 shrink-0" />{label}
      </span>
      {decisionLabel && <span className="text-[11px] text-ink-muted">{decisionLabel}</span>}
      {status === 'updated' && session.openComments > 0 && <span className="text-xs text-ink-muted">{session.openComments} open {session.openComments === 1 ? 'comment' : 'comments'}</span>}
      {runSpec && RunIcon ? (
        <span role="status" aria-label={runSpec.label} data-run={run} className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', runSpec.textClass)}>
          <RunIcon aria-hidden className={cn('size-3', runSpec.pulse && 'animate-pulse motion-reduce:animate-none')} />{runSpec.label}
        </span>
      ) : session.progress.reviewed > 0 && status !== 'approved' ? <ReviewProgress reviewed={session.progress.reviewed} total={session.progress.total} /> : <span aria-label={`${session.stats.files} files`} title={`+${session.stats.additions} −${session.stats.deletions}`} className="text-xs text-ink-muted">{session.stats.files} files</span>}
    </div>
  )
}
