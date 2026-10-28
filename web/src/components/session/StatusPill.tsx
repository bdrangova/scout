import type { SessionSummary } from '@scout/shared'
import { MessageSquareWarning } from 'lucide-react'
import { Notice } from '@/components/ui/notice'
import { reviewStatusOf, runChipOf, statusPill, statusWord } from '@/lib/session-status'
import { RunChip } from './RunChip'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

interface StatusPillProps {
  summary: Pick<SessionSummary, 'status' | 'progress' | 'openComments' | 'lastSend'>
  /** Show the short status word beside the icon (the sessions list); the full wording stays the accessible name. */
  showWord?: boolean
  className?: string
}

/**
 * The review status as an icon-first notice: the full wording is its accessible name, tooltip and
 * a visually hidden text; open comments show as a count. A run in flight or failed is its own
 * chip beside it (`RunChip`), derived from the summary's status.
 */
export function StatusPill({ summary, showWord = false, className }: StatusPillProps) {
  const status = reviewStatusOf(summary)
  const run = runChipOf(summary.status)
  const spec = statusPill({ ...summary, status })
  const { icon: Icon, noticeClass } = STATUS_TONE.session(status)
  const openComments = status === 'updated' ? summary.openComments : 0
  const solo = !showWord && openComments === 0
  const pill = (
    <Notice
      icon={<Icon />}
      aria-label={spec.label}
      title={spec.label}
      data-status={status}
      className={cn('max-w-full gap-1.5', solo ? 'pr-1' : 'pr-2.5', noticeClass, className)}
    >
      {showWord ? (
        <span className="truncate text-[12.5px] font-bold">{statusWord({ ...summary, status })}</span>
      ) : (
        <span className="sr-only">{spec.label}</span>
      )}
      {openComments > 0 && (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-bold tabular-nums" aria-hidden>
          <MessageSquareWarning className="size-[13px] stroke-[2.5]" />
          {openComments}
        </span>
      )}
    </Notice>
  )
  if (!run) return pill
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      {pill}
      <RunChip run={run} showWord={showWord} />
    </span>
  )
}
