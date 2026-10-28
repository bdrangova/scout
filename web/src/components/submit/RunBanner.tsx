import { ScoutMascot } from '@/components/brand/Scout'
import type { AgentRunStatus } from '@scout/shared'
import { SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatusDot } from '@/components/ui/status-dot'
import { STATUS_TONE, type Tone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { RunStatusTag } from './RunStatusTag'

export interface RunBannerProps {
  status: AgentRunStatus
  /** Still streaming: shows the Cancel button. */
  active: boolean
  resolved: number
  total: number
  reconnecting: boolean
  cancelling: boolean
  onCancel: () => void
  /** The run's error, or the cancel request's. Long output scrolls inside the banner. */
  error: string | null
  className?: string
}

const BANNER_TEXT: Record<AgentRunStatus, string> = {
  queued: 'Claude Code is about to start on your comments',
  running: 'Claude Code is working on your comments',
  succeeded: 'Claude Code finished working on your comments',
  failed: 'The Claude Code run failed',
  cancelled: 'The Claude Code run was cancelled',
}

const TINT_CLASS: Record<Tone, string> = {
  ok: 'border-ok-bd/50 bg-ok-bg',
  warn: 'border-warn-bd/50 bg-warn-bg',
  info: 'border-info-bd/50 bg-info-bg',
  err: 'border-err-bd/50 bg-err-bg',
  neutral: 'border-line bg-paper-2',
}

/** The tinted strip above the transcript: status, resolved counter, Cancel while active, errors. */
export function RunBanner({ status, active, resolved, total, reconnecting, cancelling, onCancel, error, className }: RunBannerProps) {
  const spec = STATUS_TONE.run(status)
  const percent = total === 0 ? 0 : Math.round((resolved / total) * 100)
  return (
    <section
      aria-label="Agent status"
      aria-live="polite"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-fine px-5 py-3.5 text-ink', TINT_CLASS[spec.tone], className)}
    >
      {active && <ScoutMascot mode="working" className="w-36 max-sm:w-28" />}
      <StatusDot tone={spec.tone} size="lg" pulse={spec.pulse} label={spec.label} />
      <span className="text-sm font-bold">{BANNER_TEXT[status]}</span>
      <span className="flex items-center gap-2.5 text-[13px]">
        <span className="font-bold tabular-nums">
          {resolved} of {total}
        </span>
        <span className="font-medium text-ink-muted">resolved</span>
        <Progress value={percent} aria-label="Resolved comments" className="gap-0 [&_[data-slot=progress-track]]:w-44">
          {null}
        </Progress>
      </span>
      <span className="ml-auto flex items-center gap-2">
        {reconnecting && <span className="text-xs font-medium text-ink-muted">reconnecting…</span>}
        <RunStatusTag status={status} />
        {active && (
          <Button size="sm" variant="reject" onClick={onCancel} disabled={cancelling} aria-busy={cancelling}>
            <SquareIcon className="size-3 fill-current" aria-hidden />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
      </span>
      {error && (
        <pre
          role="alert"
          className="order-last max-h-48 basis-full overflow-auto rounded-md border-fine border-err-bd/50 bg-paper px-3 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-red"
        >
          {error}
        </pre>
      )}
    </section>
  )
}
