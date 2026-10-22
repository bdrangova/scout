import { ScoutMascot } from '@/components/brand/Scout'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'

/** A dashed, flat panel line inside the list: "No sessions match this filter." and the like. */
export function ListNote({ children }: { children: ReactNode }) {
  return (
    <li>
      <Panel className="items-center border-dashed px-5 py-8 text-center text-[13px] font-medium text-ink-muted">
        {children}
      </Panel>
    </li>
  )
}

/** No sessions at all: how to start one. */
export function EmptyState() {
  return (
    <Panel className="items-center gap-2 border-dashed px-6 py-14 text-center">
      <ScoutMascot />
      <p className="m-0 text-base font-bold">No sessions yet</p>
      <p className="m-0 text-[13px] text-ink-muted">
        Start one from Claude Code with{' '}
        <code className="rounded-sm border-fine border-line bg-code px-1.5 py-0.5 font-mono text-xs text-ink">ai-review init --repo &lt;path&gt;</code>.
      </p>
    </Panel>
  )
}

export function LoadingState({ archived = false }: { archived?: boolean }) {
  return (
    <p className="m-0 flex items-center gap-2 text-[13px] font-medium text-ink-muted" aria-busy="true">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      {archived ? 'Loading archived sessions…' : 'Loading sessions…'}
    </p>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Notice tone="err">{message}</Notice>
      <Button size="sm" onClick={onRetry}>
        <RefreshCw />
        Retry
      </Button>
    </div>
  )
}
