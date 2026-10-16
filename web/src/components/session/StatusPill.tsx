import type { SessionSummary } from '@review-dash/shared'
import { statusPill, type StatusTone } from '@/lib/session-status'
import { cn } from '@/lib/utils'

const PILL_CLASS: Record<StatusTone, string> = {
  info: 'bg-info/10 text-info',
  neutral: 'bg-muted text-muted-foreground',
  warn: 'bg-warn/15 text-warn-foreground',
  approve: 'bg-approve/10 text-approve',
}

const DOT_CLASS: Record<StatusTone, string> = {
  info: 'bg-info',
  neutral: 'bg-muted-foreground/70',
  warn: 'bg-warn',
  approve: 'bg-approve',
}

interface StatusPillProps {
  summary: Pick<SessionSummary, 'status' | 'progress' | 'openComments'>
  className?: string
}

export function StatusPill({ summary, className }: StatusPillProps) {
  const spec = statusPill(summary)
  return (
    <span
      data-status={summary.status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        PILL_CLASS[spec.tone],
        className,
      )}
    >
      <span className={cn('size-1.75 rounded-full', DOT_CLASS[spec.dotTone ?? spec.tone])} aria-hidden />
      {spec.label}
    </span>
  )
}
