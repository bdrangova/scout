import { Panel, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import type { Transcript } from '@/lib/runs'
import { cn } from '@/lib/utils'
import { TranscriptRow } from './TranscriptRow'

export interface TranscriptPanelProps {
  runId: string
  transcript: Transcript
  /** `turn 6 · $0.42 · 2m 14s`, when known. */
  footer: string
  active: boolean
  className?: string
}

/** The run's transcript: every streamed item, then the result line with the cost footer. */
export function TranscriptPanel({ runId, transcript, footer, active, className }: TranscriptPanelProps) {
  const result = transcript.result
  return (
    <Panel role="region" aria-label="Transcript" className={className}>
      <PanelHeader>
        <PanelTitle>Transcript</PanelTitle>
        <Tag mono size="sm">
          {runId}
        </Tag>
        {footer && <span className="ml-auto font-mono text-xs font-medium text-ink-muted tabular-nums">{footer}</span>}
      </PanelHeader>
      <ol className="flex flex-col gap-1.5 px-4 py-3 text-[13px]">
        {transcript.items.length === 0 && (
          <li className="py-4 text-center text-xs font-medium text-ink-muted" aria-busy={active || undefined}>
            {active ? 'Waiting for the first message…' : 'No transcript.'}
          </li>
        )}
        {transcript.items.map((item) => (
          <TranscriptRow key={item.key} item={item} />
        ))}
        {result && (
          <li
            className={cn(
              'mt-2 flex flex-col gap-1 rounded-lg border-fine px-3 py-2 text-xs',
              result.isError ? 'border-err-bd/50 bg-err-bg' : 'border-line bg-paper-2 text-ink-muted',
            )}
            aria-label="Run result"
          >
            <span className="font-mono font-bold">{footer}</span>
            {result.text && (
              <span className={cn('max-h-72 overflow-auto break-words whitespace-pre-wrap', result.isError ? 'font-mono text-red' : 'text-ink')}>
                {result.text}
              </span>
            )}
          </li>
        )}
      </ol>
    </Panel>
  )
}
