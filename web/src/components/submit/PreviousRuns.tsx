import type { AgentRun, AgentRunStatus } from '@review-dash/shared'
import { formatRelativeTime } from '@/lib/format'
import { RUN_STATUS_LABELS, formatCost, formatElapsed, runDurationMs } from '@/lib/runs'
import { cn } from '@/lib/utils'

const STATUS_CLASS: Record<AgentRunStatus, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-info/10 text-info',
  succeeded: 'bg-approve/10 text-approve',
  failed: 'bg-reject/10 text-reject',
  cancelled: 'bg-muted text-muted-foreground',
}

export function RunStatusChip({ status, className }: { status: AgentRunStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-semibold', STATUS_CLASS[status], className)}
    >
      {status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {RUN_STATUS_LABELS[status]}
    </span>
  )
}

export interface PreviousRunsProps {
  runs: AgentRun[]
  selectedId: string | null
  onSelect: (run: AgentRun) => void
  className?: string
}

/** Every run of the session, newest first; clicking one replays its transcript. */
export function PreviousRuns({ runs, selectedId, onSelect, className }: PreviousRunsProps) {
  if (runs.length === 0) return null
  const sorted = [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  return (
    <section aria-label="Previous runs" className={cn('flex flex-col rounded-xl bg-card ring-1 ring-foreground/10', className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Previous runs</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{runs.length}</span>
      </header>
      <ul className="flex flex-col divide-y">
        {sorted.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              aria-current={run.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(run)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition hover:bg-muted/60',
                run.id === selectedId && 'bg-muted/60',
              )}
            >
              <RunStatusChip status={run.status} />
              <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                {run.costUsd !== null && <span>{formatCost(run.costUsd)}</span>}
                {run.endedAt && <span>{formatElapsed(runDurationMs(run))}</span>}
                <time dateTime={run.startedAt}>{formatRelativeTime(run.startedAt)}</time>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
