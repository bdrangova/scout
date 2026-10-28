import type { AgentRun, CommentWithStatus } from '@scout/shared'
import { pluralize } from '@/lib/format'
import type { QueuedReplyCounts } from '@/lib/pr-replies'
import { formatCost } from '@/lib/runs'

export interface SendCounts {
  files: number
  fileComments: number
  /** File comments anchored to a line of the diff. */
  lineComments: number
  spec: number
  evidence: number
  extras: number
  /** Test runs: the scenarios that carry comments, their comments (files included), and the comments on bugs and logs. */
  scenarios: number
  /** Scenario comments plus the comments on a scenario's screenshots and data files. */
  scenarioComments: number
  bugs: number
  logs: number
  /** The open overall note: `draft` until it has been sent once, `sent` while it stays open after a send. */
  overall: 'draft' | 'sent' | null
  total: number
}

/** What a send would carry, by kind: only open comments go to the agent. */
export function sendCounts(comments: readonly CommentWithStatus[]): SendCounts {
  const counts: SendCounts = { files: 0, fileComments: 0, lineComments: 0, spec: 0, evidence: 0, extras: 0, scenarios: 0, scenarioComments: 0, bugs: 0, logs: 0, overall: null, total: 0 }
  const paths = new Set<string>()
  const scenarioIds = new Set<string>()
  for (const comment of comments) {
    if (comment.status !== 'open') continue
    counts.total += 1
    const { kind, ref, anchor } = comment.target
    if (kind === 'file') {
      counts.fileComments += 1
      if (anchor) counts.lineComments += 1
      if (ref !== null) paths.add(ref)
    } else if (kind === 'spec') counts.spec += 1
    else if (kind === 'evidence') counts.evidence += 1
    else if (kind === 'extra') counts.extras += 1
    else if (kind === 'scenario') {
      counts.scenarioComments += 1
      if (ref !== null) scenarioIds.add(ref)
    } else if (kind === 'run-file') counts.scenarioComments += 1
    else if (kind === 'bug') counts.bugs += 1
    else if (kind === 'log') counts.logs += 1
    else counts.overall = comment.sentAt === null ? 'draft' : 'sent'
  }
  counts.files = paths.size
  counts.scenarios = scenarioIds.size
  return counts
}

export interface SummaryRow {
  label: string
  value: string
}

/** The rows of the "will be sent" summary; kinds with nothing to send are left out. */
export function summaryRows(counts: SendCounts): SummaryRow[] {
  const rows: SummaryRow[] = []
  if (counts.fileComments > 0) {
    rows.push({ label: 'Files', value: `${pluralize(counts.fileComments, 'comment')} · ${pluralize(counts.files, 'file')}` })
    if (counts.lineComments > 0) rows.push({ label: 'Lines', value: `${counts.lineComments} of them` })
  }
  if (counts.spec > 0) rows.push({ label: 'Spec', value: String(counts.spec) })
  if (counts.evidence > 0) rows.push({ label: 'Evidence', value: String(counts.evidence) })
  if (counts.extras > 0) rows.push({ label: 'Extras', value: String(counts.extras) })
  if (counts.scenarioComments > 0) rows.push({ label: 'Scenarios', value: `${pluralize(counts.scenarioComments, 'comment')} · ${pluralize(counts.scenarios, 'scenario')}` })
  if (counts.bugs > 0) rows.push({ label: 'Bugs', value: String(counts.bugs) })
  if (counts.logs > 0) rows.push({ label: 'Logs', value: String(counts.logs) })
  if (counts.overall) rows.push({ label: 'Overall note', value: counts.overall })
  return rows
}

/** The PR comment drafts a Submit carries: instructions for Claude on open threads, replies approved to post on answered ones. */
export function prReplyRows(queued: QueuedReplyCounts): SummaryRow[] {
  const rows: SummaryRow[] = []
  if (queued.instructions > 0) rows.push({ label: 'Instructions', value: String(queued.instructions) })
  if (queued.replies > 0) rows.push({ label: 'PR replies', value: String(queued.replies) })
  return rows
}

/** `Run 2 · failed`: runs are numbered oldest first. */
export function runTitle(number: number, status: AgentRun['status']): string {
  return `Run ${number} · ${status}`
}

/** The second line of a run in the rail: why it failed, or what it resolved and cost. */
export function runDetail(run: AgentRun): string {
  if (run.status === 'failed') return run.error ?? (run.exitCode === null ? 'failed' : `exit ${run.exitCode}`)
  const parts: string[] = []
  if (run.resolvedComments.length > 0) parts.push(`resolved ${pluralize(run.resolvedComments.length, 'comment')}`)
  if (run.costUsd !== null) parts.push(formatCost(run.costUsd))
  return parts.length > 0 ? parts.join(' · ') : run.status === 'running' ? 'in progress' : 'no comments resolved'
}
