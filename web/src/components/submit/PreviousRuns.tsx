import type { AgentRun } from '@review-dash/shared'
import { HistoryIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Panel, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { formatRelativeTime } from '@/lib/format'
import { formatCost, formatElapsed, runDurationMs } from '@/lib/runs'
import { cn } from '@/lib/utils'
import { RunStatusTag } from './RunStatusTag'

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
    <Panel role="region" aria-label="Previous runs" className={className}>
      <PanelHeader>
        <HistoryIcon className="size-4 text-ink-muted" aria-hidden />
        <PanelTitle>Previous runs</PanelTitle>
        <Badge variant="neutral" className="ml-auto">
          {runs.length}
        </Badge>
      </PanelHeader>
      <ul className="flex flex-col divide-y-[1.5px] divide-line">
        {sorted.map((run) => {
          const current = run.id === selectedId
          return (
            <li key={run.id}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(run)}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[13px] transition-colors',
                  current ? 'bg-yellow text-on-yellow' : 'hover:bg-hover',
                )}
              >
                <RunStatusTag status={run.status} />
                <span className="font-mono text-xs">{run.id}</span>
                <span className={cn('ml-auto flex items-center gap-3 text-xs tabular-nums', !current && 'text-ink-muted')}>
                  {run.costUsd !== null && <span>{formatCost(run.costUsd)}</span>}
                  {run.endedAt && <span>{formatElapsed(runDurationMs(run))}</span>}
                  <time dateTime={run.startedAt}>{formatRelativeTime(run.startedAt)}</time>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
