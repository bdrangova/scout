import type { AgentRun, AgentRunStatus, CommentWithStatus } from '@review-dash/shared'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  cancelRun,
  describeApiError,
  formatRunFooter,
  isDeniedResult,
  isRunActive,
  runDurationMs,
  toolInputSummary,
  type TranscriptItem,
} from '@/lib/runs'
import { useRunEvents } from '@/lib/useRunEvents'
import { cn } from '@/lib/utils'
import { RunStatusChip } from './PreviousRuns'

export interface AgentRunViewProps {
  /** The run as last fetched; the live status comes from the event stream. */
  run: AgentRun
  /** Every comment of the review, to count how many of the sent ones are resolved by now. */
  comments: CommentWithStatus[]
  /** Called with the final run when the stream ends, and after a cancel request. */
  onRunChange?: (run: AgentRun) => void
  className?: string
}

const BANNER_TEXT: Record<AgentRunStatus, string> = {
  queued: 'Claude Code is about to start on your comments',
  running: 'Claude Code is working on your comments',
  succeeded: 'Claude Code finished working on your comments',
  failed: 'The Claude Code run failed',
  cancelled: 'The Claude Code run was cancelled',
}

/** Streams one run: banner with the resolved counter, transcript, result footer and Cancel. */
export function AgentRunView({ run, comments, onRunChange, className }: AgentRunViewProps) {
  const { transcript, finalRun, reconnecting } = useRunEvents(run.id)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const percent = total === 0 ? 0 : Math.round((resolved / total) * 100)

  async function cancel() {
    setCancelling(true)
    setError(null)
    try {
      await cancelRun(run.id)
    } catch (reason: unknown) {
      setError(describeApiError(reason))
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
    <div className={cn('flex flex-col gap-4', className)}>
      <section
        aria-label="Agent status"
        aria-live="polite"
        className={cn(
          'flex flex-wrap items-center gap-4 rounded-xl px-5 py-3.5 ring-1',
          active ? 'bg-info/10 ring-info/30' : status === 'succeeded' ? 'bg-approve/10 ring-approve/30' : 'bg-muted ring-foreground/10',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-3 shrink-0 rounded-full',
            active ? 'animate-pulse bg-info ring-4 ring-info/20' : status === 'succeeded' ? 'bg-approve' : 'bg-muted-foreground',
          )}
        />
        <span className="text-sm font-semibold">{BANNER_TEXT[status]}</span>
        <span className="text-muted-foreground">·</span>
        <span className="flex items-center gap-2.5 text-[13px]">
          <span className="font-semibold tabular-nums">
            {resolved} of {total}
          </span>
          <span className="text-muted-foreground">resolved</span>
          <Progress value={percent} aria-label="Resolved comments" className="w-44 gap-0">
            {null}
          </Progress>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {reconnecting && <span className="text-xs text-muted-foreground">reconnecting…</span>}
          <RunStatusChip status={status} />
          {active && (
            <Button size="sm" variant="outline" className="border-reject/60 text-reject hover:bg-reject/10" onClick={cancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
        </span>
        {(error || current.error) && (
          <p role="alert" className="basis-full text-xs text-reject">
            {error ?? current.error}
          </p>
        )}
      </section>

      <section aria-label="Transcript" className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="flex items-center gap-2.5 border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Transcript</h3>
          <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
          {footer && <span className="ml-auto font-mono text-xs text-muted-foreground">{footer}</span>}
        </header>
        <ol className="flex flex-col gap-1.5 px-4 py-3 text-[13px]">
          {transcript.items.length === 0 && (
            <li className="py-4 text-center text-xs text-muted-foreground">{active ? 'Waiting for the first message…' : 'No transcript.'}</li>
          )}
          {transcript.items.map((item) => (
            <TranscriptRow key={item.key} item={item} />
          ))}
          {transcript.result && (
            <li
              className={cn(
                'mt-2 flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs',
                transcript.result.isError ? 'border-reject/40 bg-reject/5 text-reject' : 'border-border bg-muted/40 text-muted-foreground',
              )}
              aria-label="Run result"
            >
              <span className="font-mono font-semibold">{footer}</span>
              {transcript.result.text && <span className="whitespace-pre-wrap text-foreground/80">{transcript.result.text}</span>}
            </li>
          )}
        </ol>
      </section>
    </div>
  )
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'init':
      return (
        <li className="font-mono text-[11px] text-muted-foreground">
          {item.model} · session {item.sessionId}
        </li>
      )
    case 'text':
      return (
        <li className="flex items-start gap-2.5 py-1">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
            <Sparkles className="size-3" />
          </span>
          <p className="whitespace-pre-wrap pt-0.5 leading-relaxed">
            {item.text}
            {item.streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-text-bottom" aria-hidden />}
          </p>
        </li>
      )
    case 'tool':
      return <ToolRow item={item} />
    case 'stderr':
      return <li className="ml-9 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground/70">{item.line}</li>
    case 'error':
      return (
        <li role="alert" className="ml-9 rounded-lg border border-reject/40 bg-reject/5 px-3 py-1.5 text-xs text-reject">
          {item.message}
        </li>
      )
  }
}

function ToolRow({ item }: { item: Extract<TranscriptItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const result = item.result
  const denied = result !== null && result.isError && isDeniedResult(result.text)
  const failed = result !== null && result.isError
  const summary = toolInputSummary(item.input)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <li
      className={cn(
        'ml-9 flex flex-col rounded-lg border font-mono text-xs',
        failed ? 'border-reject/40 bg-reject/5' : 'border-border bg-muted/40',
      )}
      aria-label={`Tool ${item.name}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn('rounded px-1.5 py-px text-[11px] font-semibold', failed ? 'bg-reject text-white' : 'bg-foreground text-background')}>
          {item.name}
        </span>
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span className={cn('shrink-0 font-semibold', result === null ? 'text-muted-foreground' : failed ? 'text-reject' : 'text-approve')}>
          {result === null ? 'running' : denied ? 'denied' : failed ? 'error' : 'ok'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-2.5 py-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
            {typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2)}
          </pre>
          {result && (
            <pre className={cn('max-h-64 overflow-auto whitespace-pre-wrap text-[11px]', failed ? 'text-reject' : 'text-foreground/80')}>
              {result.text}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}
