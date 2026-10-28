import type { SessionSummary } from '@scout/shared'
import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import { Notice } from '@/components/ui/notice'
import { RunChip } from '@/components/session/RunChip'
import { statusPill, type ReviewStatus, type RunChipKind } from '@/lib/session-status'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

interface SessionStatusNoticeProps {
  summary: Pick<SessionSummary, 'progress' | 'openComments' | 'lastSend'> & { status: ReviewStatus; run?: RunChipKind | null }
  /** Makes the review pill a link (Submit, for "Ready to submit"). */
  to?: string
  /** Makes the failed-run chip a link (Submit, to retry). */
  runTo?: string
  className?: string
}

/** The review state as a tinted notice (icon, the wording of `statusPill`, the open-comment count) with the run chip beside it while an agent run is active or failed. */
export function SessionStatusNotice({ summary, to, runTo, className }: SessionStatusNoticeProps) {
  const spec = statusPill(summary)
  const { icon: Icon, noticeClass } = STATUS_TONE.session(summary.status)
  const pill = (
    <Notice
      icon={<Icon />}
      data-status={summary.status}
      title={spec.label}
      className={cn(noticeClass, className)}
    >
      <span className="truncate">{spec.label}</span>
      {summary.openComments > 0 && (
        <span className="inline-flex items-center gap-1 tabular-nums" aria-hidden>
          <MessageSquare className="size-[13px]" />
          {summary.openComments}
        </span>
      )}
    </Notice>
  )
  const review = to ? (
    <Link to={to} aria-label={`${spec.label}: go to Submit`} className="min-w-0 shrink rounded-md no-underline">
      {pill}
    </Link>
  ) : (
    pill
  )
  if (!summary.run) return review
  return (
    <>
      {review}
      <RunChip run={summary.run} to={summary.run === 'failed' ? runTo : undefined} />
    </>
  )
}
