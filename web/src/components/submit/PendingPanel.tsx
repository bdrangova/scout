import type { AgentRun } from '@review-dash/shared'
import { CopyIcon, ExternalLinkIcon, GitForkIcon } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { StatusDot } from '@/components/ui/status-dot'
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

  const code = <code className="rounded-md border-fine border-line bg-paper-2 px-1.5 py-px font-mono text-xs">{command}</code>

  return (
    <Panel role="region" aria-label="Feedback pending" className={cn('border-warn-bd', className)}>
      <PanelHeader className="bg-warn-bg">
        <StatusDot tone="warn" label="" aria-hidden />
        <PanelTitle>Feedback saved</PanelTitle>
        <span className="text-[12.5px] font-medium text-ink-muted">no run started</span>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-2 text-[13.5px] leading-[1.45]">
        {reason && <p className="font-medium text-ink-muted">{reason}</p>}
        {mode === 'new' ? (
          <p>The new Claude Desktop session opens with {code} ready; confirm it there.</p>
        ) : (
          <p>Send any message in your open Claude Code session, or run {code} there, to pick it up.</p>
        )}
      </PanelBody>
      <PanelFooter className="flex flex-wrap items-center gap-2">
        {mode === 'new' && (
          <a href={desktopNewSessionUrl(repoPath, sessionId)} className={buttonVariants({ size: 'sm' })}>
            <ExternalLinkIcon aria-hidden />
            Open in Claude Desktop
          </a>
        )}
        <Button size="sm" onClick={copy}>
          <CopyIcon aria-hidden />
          {copied ? 'Copied' : 'Copy command'}
        </Button>
        <Button size="sm" onClick={fork} disabled={starting} aria-busy={starting}>
          <GitForkIcon aria-hidden />
          {starting ? 'Starting…' : 'Run as fork'}
        </Button>
        {error && (
          <Notice tone="err" className="basis-full">
            {error}
          </Notice>
        )}
      </PanelFooter>
    </Panel>
  )
}
