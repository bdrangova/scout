import type { AgentRun } from '@review-dash/shared'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { applyReviewCommand, describeApiError, desktopNewSessionUrl, startRun, type SendTarget } from '@/lib/runs'
import { cn } from '@/lib/utils'

export interface PendingPanelProps {
  sessionId: string
  /** Absolute repo path, for the Claude Desktop deep link in `new` mode. */
  repoPath: string
  mode: SendTarget
  /** The server's reason when it declined to start a run; `null` when no run was asked for. */
  reason: string | null
  onRun: (run: AgentRun) => void
  className?: string
}

/**
 * Shown when the feedback was written but no headless run started. `current`: the reviewer's open
 * Claude Code session picks it up on their next message (or `/apply-review` there). `new`: a
 * Desktop deep link opens a fresh session with the command prefilled. Either way a headless fork
 * is one click away.
 */
export function PendingPanel({ sessionId, repoPath, mode, reason, onRun, className }: PendingPanelProps) {
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

  const code = <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">{command}</code>

  return (
    <section
      aria-label="Feedback pending"
      className={cn('flex flex-col gap-3 rounded-xl border border-warn/50 bg-warn/10 px-5 py-4 text-[13px]', className)}
    >
      <div className="flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-warn" aria-hidden />
        <h3 className="text-sm font-semibold">Feedback saved</h3>
      </div>
      {reason && <p className="text-muted-foreground">{reason}</p>}
      {mode === 'new' ? (
        <p>The new Claude Desktop session opens with {code} ready; confirm it there.</p>
      ) : (
        <p>Send any message in your open Claude Code session, or run {code} there, to pick it up.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'new' && (
          <a href={desktopNewSessionUrl(repoPath, sessionId)} className={buttonVariants({ size: 'sm' })}>
            Open in Claude Desktop
          </a>
        )}
        <Button size="sm" variant={mode === 'new' ? 'outline' : 'default'} onClick={copy}>
          {copied ? 'Copied' : 'Copy command'}
        </Button>
        <Button size="sm" variant="outline" onClick={fork} disabled={starting}>
          {starting ? 'Starting…' : 'Run as fork'}
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
