import type { AgentRun, AgentRunStatus, CommentWithStatus } from '@scout/shared'
import { useEffect, useRef, useState } from 'react'
import { cancelRun, describeApiError, formatRunFooter, isRunActive, runDurationMs } from '@/lib/runs'
import { useRunEvents } from '@/lib/useRunEvents'
import { cn } from '@/lib/utils'
import { RunBanner } from './RunBanner'
import { TranscriptPanel } from './TranscriptPanel'

export interface AgentRunViewProps {
  /** The run as last fetched; the live status comes from the event stream. */
  run: AgentRun
  /** Every comment of the review, to count how many of the sent ones are resolved by now. */
  comments: CommentWithStatus[]
  /** Called with the final run when the stream ends, and after a cancel request. */
  onRunChange?: (run: AgentRun) => void
  className?: string
}

/** Streams one run: the status banner with the resolved counter, the transcript, the result footer and Cancel. */
export function AgentRunView({ run, comments, onRunChange, className }: AgentRunViewProps) {
  const { transcript, finalRun, reconnecting } = useRunEvents(run.id)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const current = finalRun ?? run
  const status: AgentRunStatus = finalRun?.status ?? transcript.status ?? run.status
  const active = isRunActive(status) && finalRun === null
  const onRunChangeRef = useRef(onRunChange)

  useEffect(() => {
    onRunChangeRef.current = onRunChange
  })

  useEffect(() => {
    if (finalRun) onRunChangeRef.current?.(finalRun)
  }, [finalRun])

  const sent = comments.filter((comment) => comment.sentAt === run.sentAt)
  const total = sent.length > 0 ? sent.length : current.resolvedComments.length
  const resolved = sent.length > 0 ? sent.filter((comment) => comment.status === 'resolved').length : current.resolvedComments.length

  async function cancel() {
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelRun(run.id)
    } catch (reason: unknown) {
      setCancelError(describeApiError(reason))
    } finally {
      setCancelling(false)
    }
  }

  const footer = formatRunFooter({
    numTurns: transcript.result?.numTurns ?? current.numTurns,
    costUsd: transcript.result?.costUsd ?? current.costUsd,
    durationMs: transcript.result?.durationMs ?? (current.endedAt ? runDurationMs(current) : null),
  })

  return (
    <div className={cn('flex flex-col gap-[18px]', className)}>
      <RunBanner
        status={status}
        active={active}
        resolved={resolved}
        total={total}
        reconnecting={reconnecting}
        cancelling={cancelling}
        onCancel={cancel}
        error={cancelError ?? current.error}
      />
      <TranscriptPanel runId={run.id} transcript={transcript} footer={footer} active={active} />
    </div>
  )
}
