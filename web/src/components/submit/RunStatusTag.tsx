import type { AgentRunStatus } from '@review-dash/shared'
import { StatusDot } from '@/components/ui/status-dot'
import { Tag } from '@/components/ui/tag'
import { STATUS_TONE } from '@/lib/status-tone'

/** The run's status as a tinted tag with its dot: `STATUS_TONE.run` decides the colour and the pulse. */
export function RunStatusTag({ status, className }: { status: AgentRunStatus; className?: string }) {
  const spec = STATUS_TONE.run(status)
  return (
    <Tag tone={spec.tone} size="sm" data-status={status} className={className}>
      <StatusDot tone={spec.tone} size="sm" pulse={spec.pulse} label="" aria-hidden />
      {spec.label}
    </Tag>
  )
}
