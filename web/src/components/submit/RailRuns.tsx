import type { AgentRun } from '@review-dash/shared'
import { StatusDot } from '@/components/ui/status-dot'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { RailHead } from './RailHead'
import { runDetail, runTitle } from './will-be-sent'

interface RailRunsProps {
  runs: readonly AgentRun[]
  selectedId: string | null
  onSelect: (run: AgentRun) => void
}

/** The run history in the rail, newest first; a click replays the run's transcript. */
export function RailRuns({ runs, selectedId, onSelect }: RailRunsProps) {
  const oldestFirst = [...runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const rows = oldestFirst.map((run, index) => ({ run, number: index + 1 })).reverse()
  return (
    <section aria-label="Run history" className="flex flex-col gap-1.5">
      <RailHead title="Runs" />
      {rows.length === 0 ? (
        <p className="m-0 flex flex-col text-[12.5px] text-ink-muted">
          <span className="font-semibold">Nothing sent yet</span>
          <span className="text-xs">Runs appear here after Submit</span>
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map(({ run, number }) => {
            const spec = STATUS_TONE.run(run.status)
            const current = run.id === selectedId
            return (
              <li key={run.id}>
                <button
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSelect(run)}
                  className={cn(
                    'flex min-h-[40px] w-full items-center gap-2.5 rounded-sm px-1.5 py-1 text-left',
                    current ? 'bg-yellow text-on-yellow' : 'hover:bg-hover',
                  )}
                >
                  <StatusDot tone={spec.tone} pulse={spec.pulse} label="" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] font-bold">{runTitle(number, run.status)}</span>
                    <span className={cn('truncate text-xs', !current && 'text-ink-muted')} title={runDetail(run)}>
                      {runDetail(run)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
