import { CircleCheckIcon, CircleIcon, Loader2Icon, OctagonXIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

import type { Step } from './steps'

function seconds(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))}s`
}

/** Ticks once a second while `on`, so a running clock re-renders. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}

/** A live checklist for a slow, multi-step job: what's done, what's running (with how long it's taken so far), what's next. */
export function StepList({ steps, className }: { steps: Step[]; className?: string }) {
  const running = steps.some((s) => s.state === 'active')
  const now = useNow(running)
  return (
    <ol aria-label="Progress" aria-live="polite" className={cn('flex flex-col gap-1.5 text-sm', className)}>
      {steps.map((step, i) => {
        const elapsed = step.startedAt === undefined ? null : (step.endedAt ?? now) - step.startedAt
        return (
          <li key={i} data-state={step.state} className={cn('flex items-center gap-2', step.state === 'pending' ? 'text-ink-muted' : 'text-ink')}>
            {step.state === 'done' && <CircleCheckIcon aria-label="Done" className="size-4 shrink-0 text-ok-bd" />}
            {step.state === 'active' && <Loader2Icon aria-label="Running" className="size-4 shrink-0 animate-spin" />}
            {step.state === 'failed' && <OctagonXIcon aria-label="Failed" className="size-4 shrink-0 text-err-bd" />}
            {step.state === 'pending' && <CircleIcon aria-label="Waiting" className="size-4 shrink-0 opacity-50" />}
            <span className="min-w-0 flex-1 truncate">{step.label}</span>
            {elapsed !== null && step.state !== 'pending' && <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">{seconds(elapsed)}</span>}
          </li>
        )
      })}
    </ol>
  )
}
