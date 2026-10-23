import type { SessionStatus } from '@review-dash/shared'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/** Shared dashboard status mark: the same shape, wording, and color in cards and filters. */
export function SessionStatusLabel({ status, className }: { status: SessionStatus; className?: string }) {
  const spec = STATUS_TONE.session(status)
  const Icon = spec.icon
  return <span role="status" aria-label={status === 'sent' ? 'Review sent' : spec.label} data-status={status} className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold', spec.textClass, className)}><Icon aria-hidden className="size-3.5 shrink-0" />{status === 'sent' ? 'Review sent' : spec.label}</span>
}
