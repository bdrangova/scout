import type { AgentRun } from '@review-dash/shared'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { applyReviewCommand, describeApiError, startRun } from '@/lib/runs'
import { cn } from '@/lib/utils'

export interface PendingPanelProps {
  sessionId: string
  reason: string
  onRun: (run: AgentRun) => void
  className?: string
}

/**
 * Shown when the feedback was written but no headless run started: the Claude Code session is
 * still open (or another run is active), so the reviewer runs the skill there or forks.
 */
export function PendingPanel({ sessionId, reason, onRun, className }: PendingPanelProps) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const command = applyReviewCommand(sessionId)

  async function fork() {
    setStarting(true)
    setError(null)
    try {
      onRun(await startRun(sessionId, true))
    } catch (reason: unknown) {
      setError(describeApiError(reason))
    } finally {
      setStarting(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy; select the command and copy it yourself.')
    }
  }

  return (
    <section
      aria-label="Feedback pending"
      className={cn('flex flex-col gap-3 rounded-xl border border-warn/50 bg-warn/10 px-5 py-4 text-[13px]', className)}
    >
      <div className="flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-warn" aria-hidden />
        <h3 className="text-sm font-semibold">Feedback saved, waiting for Claude Code</h3>
      </div>
      <p className="text-muted-foreground">{reason}</p>
      <p>
        Run <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">{command}</code> in your open Claude
        Code session, or start a fork of it here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={fork} disabled={starting}>
          {starting ? 'Starting…' : 'Run as fork'}
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy command'}
        </Button>
        {error && (
          <span role="alert" className="text-xs text-reject">
            {error}
          </span>
        )}
      </div>
    </section>
  )
}
