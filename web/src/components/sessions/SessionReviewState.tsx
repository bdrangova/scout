import { statusPill, statusWord, statusSourceOf, type LiveSummary } from '@/lib/session-status'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { ReviewProgress } from './ReviewProgress'

/** Dashboard language explains the submitted decision without changing lifecycle semantics. */
export function SessionReviewState({ session, showProgress = true }: { session: LiveSummary; showProgress?: boolean }) {
  const source = statusSourceOf(session)
  const unit = session.kind === 'test-run' ? 'scenarios' : 'files'
  const total = session.kind === 'test-run' ? session.total : session.stats.files
  const { status } = source
  const spec = STATUS_TONE.session(status)
  const Icon = spec.icon
  const label = status === 'sent' ? 'Review sent' : statusWord(source)
  const decision = status === 'sent' ? session.lastSend?.decision : null
  const decisionLabel = decision === 'approve' ? 'Approval submitted' : decision === 'request-changes' ? 'Changes requested' : decision === 'reject' ? 'Rejected' : null
  const description = statusPill(source).label.replaceAll('files', unit)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span role="status" aria-label={decisionLabel ? `${label} · ${decisionLabel}` : description} data-status={status} title={description} className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', spec.textClass)}>
        <Icon aria-hidden className="size-3.5 shrink-0" />{label}
      </span>
      {decisionLabel && <span className="text-[11px] text-ink-muted">{decisionLabel}</span>}
      {showProgress && status === 'updated' && session.openComments > 0 && <span className="text-xs text-ink-muted">{session.openComments} open {session.openComments === 1 ? 'comment' : 'comments'}</span>}
      {!showProgress ? null : source.progress.reviewed > 0 && status !== 'approved' ? <ReviewProgress reviewed={source.progress.reviewed} total={source.progress.total} unit={unit} /> : <span aria-label={`${total} ${unit}`} title={session.kind === 'test-run' ? `${total} scenarios` : `+${session.stats.additions} −${session.stats.deletions}`} className="text-xs text-ink-muted">{total} {unit}</span>}
    </div>
  )
}
