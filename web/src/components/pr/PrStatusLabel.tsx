import type { PrStatus } from '@scout/shared'
import { PR_STATUS_SPEC } from '@/lib/pr-status'
import { cn } from '@/lib/utils'

/** A PR's or PR review's status: icon and word in the status colour, shaped like the session status label. */
export function PrStatusLabel({ status, className }: { status: PrStatus; className?: string }) {
  const spec = PR_STATUS_SPEC[status]
  const Icon = spec.icon
  return <span role="status" aria-label={spec.label} data-status={status} className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold', spec.textClass, className)}><Icon aria-hidden className="size-3.5 shrink-0" />{spec.label}</span>
}
