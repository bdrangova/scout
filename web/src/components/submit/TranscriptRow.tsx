import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { isDeniedResult, toolInputSummary, type TranscriptItem } from '@/lib/runs'
import { cn } from '@/lib/utils'

/** One item of a run transcript: the init line, a paragraph, a tool call, a stderr line or an error. */
export function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'init':
      return (
        <li className="font-mono text-[11px] font-medium text-ink-muted">
          {item.model} · session {item.sessionId}
        </li>
      )
    case 'text':
      return (
        <li className="flex items-start gap-2.5 py-1">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-paper" aria-hidden>
            <SparklesIcon className="size-3" />
          </span>
          <p className="min-w-0 pt-0.5 leading-relaxed break-words whitespace-pre-wrap">
            {item.text}
            {item.streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-ink align-text-bottom" aria-hidden />}
          </p>
        </li>
      )
    case 'tool':
      return <ToolRow item={item} />
    case 'stderr':
      return <li className="ml-9 font-mono text-[11px] font-medium break-words whitespace-pre-wrap text-ink-muted">{item.line}</li>
    case 'error':
      return (
        <li role="alert" className="ml-9 rounded-md border-fine border-err-bd/50 bg-err-bg px-3 py-1.5 text-xs font-semibold break-words whitespace-pre-wrap">
          {item.message}
        </li>
      )
  }
}

function ToolRow({ item }: { item: Extract<TranscriptItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const result = item.result
  const failed = result !== null && result.isError
  const denied = failed && isDeniedResult(result.text)
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  return (
    <li
      className={cn('ml-9 flex flex-col rounded-lg border-fine font-mono text-xs', failed ? 'border-err-bd/50 bg-err-bg' : 'border-line bg-paper-2')}
      aria-label={`Tool ${item.name}`}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <Chevron className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className={cn('rounded-sm px-1.5 py-px text-[11px] font-bold', failed ? 'bg-red-solid text-on-red' : 'bg-ink text-paper')}>{item.name}</span>
        <span className="min-w-0 flex-1 truncate">{toolInputSummary(item.input)}</span>
        <span className={cn('shrink-0 font-bold', result === null ? 'text-ink-muted' : failed ? 'text-red' : 'text-green')}>
          {result === null ? 'running' : denied ? 'denied' : failed ? 'error' : 'ok'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t-fine border-line px-2.5 py-2">
          <pre className="max-h-48 overflow-auto text-[11px] break-words whitespace-pre-wrap text-ink-muted">
            {typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2)}
          </pre>
          {result && (
            <pre className={cn('max-h-64 overflow-auto text-[11px] break-words whitespace-pre-wrap', failed ? 'text-red' : 'text-ink')}>{result.text}</pre>
          )}
        </div>
      )}
    </li>
  )
}
