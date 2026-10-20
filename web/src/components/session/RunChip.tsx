import { Link } from 'react-router'
import { Notice } from '@/components/ui/notice'
import { StatusDot } from '@/components/ui/status-dot'
import type { RunChipKind } from '@/lib/session-status'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

const RUN_STATUS = { working: 'agent-working', failed: 'run-failed' } as const

interface RunChipProps {
  run: RunChipKind
  /** Show the word beside the icon (the list rows and the rail); the label stays the accessible name. */
  showWord?: boolean
  /** Makes a failed chip a link (Submit, where the run can be retried). */
  to?: string
  className?: string
}

/**
 * "Agent working" (live dot) or "Run failed" (err tone), shown beside the review pill, never in
 * place of it: the review state stays readable while the agent runs.
 */
export function RunChip({ run, showWord = true, to, className }: RunChipProps) {
  const { icon: Icon, noticeClass, fillClass, label } = STATUS_TONE.session(RUN_STATUS[run])
  const chip = (
    <Notice
      icon={<Icon />}
      aria-label={label}
      title={label}
      data-run={run}
      className={cn('max-w-full gap-1.5', showWord ? 'pr-2.5' : 'pr-1', noticeClass, className)}
    >
      {showWord ? <span className="truncate text-[12.5px] font-bold">{label}</span> : <span className="sr-only">{label}</span>}
      {run === 'working' && <StatusDot pulse label="" aria-hidden className={cn('mx-0.5', fillClass)} />}
    </Notice>
  )
  if (!to) return chip
  return (
    <Link to={to} aria-label={`${label}: go to Submit`} className="min-w-0 shrink rounded-md no-underline">
      {chip}
    </Link>
  )
}
