import type { AgentRun } from '@review-dash/shared'
import { RotateCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'

export interface FailedRunNoticeProps {
  run: AgentRun
  /** Sends the review again (a new run). */
  onRetry: () => void
  /** Opens the failed run's transcript. */
  onView: () => void
  retrying: boolean
  /** Why retrying is not possible right now (no decision, …). */
  blocked: boolean
}

/** First non-empty line of the run's error, so a stack trace does not fill the page. */
function errorHeadline(run: AgentRun): string {
  const line = (run.error ?? run.resultText ?? '').split('\n').find((text) => text.trim() !== '')
  return line?.trim() ?? 'No error message was recorded.'
}

/** The top of Submit when the latest Claude Code run failed: what happened and a way to try again. */
export function FailedRunNotice({ run, onRetry, onView, retrying, blocked }: FailedRunNoticeProps) {
  return (
    <section aria-label="Run failed" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Notice tone="err" className="min-w-0 max-w-full">
        <strong className="font-bold">The last Claude Code run failed.</strong>
        <span className="min-w-0 truncate font-medium" title={errorHeadline(run)}>
          {errorHeadline(run)}
        </span>
      </Notice>
      <span className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onRetry} disabled={retrying || blocked} aria-busy={retrying}>
          <RotateCwIcon aria-hidden />
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onView}>
          View run
        </Button>
      </span>
    </section>
  )
}
