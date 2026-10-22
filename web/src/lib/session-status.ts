import type { AgentRunStatus, SessionListItem, SessionStatus, SessionSummary, TestRunSummary } from '@review-dash/shared'
import { pluralize } from './format'
import { DECISION_LABELS } from './runs'
import { STATUS_TONE, type Tone } from './status-tone'

export type StatusFilter = 'all' | 'awaiting' | 'in-progress' | 'ready' | 'sent' | 'updated' | 'approved' | 'archived'

/**
 * The list chips. Each one reads its wording from `STATUS_TONE.session` of its review state;
 * a session with a run going or failed is filed under its review state (the run is a separate chip).
 */
const FILTER_STATUS: Record<Exclude<StatusFilter, 'all' | 'archived'>, SessionStatus> = {
  awaiting: 'unreviewed',
  'in-progress': 'in-progress',
  ready: 'ready',
  sent: 'sent',
  updated: 'updated',
  approved: 'approved',
}

export const STATUS_FILTERS: readonly { id: StatusFilter; label: string; status: SessionStatus | null }[] = [
  { id: 'all', label: 'All', status: null },
  ...(Object.keys(FILTER_STATUS) as (keyof typeof FILTER_STATUS)[]).map((id) => ({
    id,
    label: STATUS_TONE.session(FILTER_STATUS[id]).label,
    status: FILTER_STATUS[id],
  })),
  /** Archived sessions come from a separate fetch (`/sessions/archived`); `all` never includes them. */
  { id: 'archived', label: 'Archived', status: null },
]

/** A row that loaded: a code review or a test run (not a broken manifest). */
export type LiveSummary = SessionSummary | TestRunSummary

export function isLiveSummary(item: SessionListItem): item is LiveSummary {
  return !('error' in item)
}

export function isTestRunSummary(item: SessionListItem): item is TestRunSummary {
  return isLiveSummary(item) && item.kind === 'test-run'
}

export function isSessionSummary(item: SessionListItem): item is SessionSummary {
  return isLiveSummary(item) && item.kind !== 'test-run'
}

/** The fields the status wording reads, the same for both kinds (a test run's `reviewed/total` is the progress). */
export function statusSourceOf(summary: LiveSummary): StatusSource {
  if (summary.kind !== 'test-run') return summary
  return { status: summary.status, progress: { reviewed: summary.reviewed, total: summary.total }, openComments: summary.openComments, lastSend: summary.lastSend }
}

/** `unreviewed` → Awaiting review; the rest map 1:1. A run state counts under the review status it overlays (`reviewStatusOf`); `agent-working` and `run-failed` alone fall back to Changes sent. */
export function statusFilterOf(status: SessionStatus): Exclude<StatusFilter, 'all'> {
  switch (status) {
    case 'unreviewed':
      return 'awaiting'
    case 'in-progress':
      return 'in-progress'
    case 'ready':
      return 'ready'
    case 'sent':
    case 'agent-working':
    case 'run-failed':
      return 'sent'
    case 'updated':
      return 'updated'
    case 'approved':
      return 'approved'
  }
}

/** The review lifecycle without the run overlay: what the pill shows whether or not an agent run is going on. */
export type ReviewStatus = Exclude<SessionStatus, 'agent-working' | 'run-failed'>

/** The run chip shown beside the review pill: "Agent working" or "Run failed". */
export type RunChipKind = 'working' | 'failed'

type StatusSource = Pick<SessionSummary, 'status' | 'progress' | 'openComments' | 'lastSend'>

/** The run chip of a summary status (the server resolves working over failed), or null. */
export function runChipOf(status: SessionStatus): RunChipKind | null {
  if (status === 'agent-working') return 'working'
  if (status === 'run-failed') return 'failed'
  return null
}

/** The run chip of a live session: an active run wins over a failed newest run, like the server's status. */
export function runChipFor(activeRun: boolean, latestRunStatus: AgentRunStatus | null | undefined): RunChipKind | null {
  if (activeRun) return 'working'
  return latestRunStatus === 'failed' ? 'failed' : null
}

/**
 * The review status a summary would show without its run. The server folds the run into `status`,
 * so for a run state it is rebuilt from what the summary carries: a send decides Approved (Approve)
 * or Changes sent, else the progress and comments decide. (`Updated` is not recoverable here; the
 * open session derives it exactly in `useSessionSummary`.)
 */
export function reviewStatusOf(summary: StatusSource): ReviewStatus {
  const { status, progress, openComments, lastSend } = summary
  if (status !== 'agent-working' && status !== 'run-failed') return status
  if (lastSend) return lastSend.decision === 'approve' ? 'approved' : 'sent'
  if (progress.total > 0 && progress.reviewed === progress.total) return 'ready'
  return progress.reviewed > 0 || openComments > 0 ? 'in-progress' : 'unreviewed'
}

export interface StatusPillSpec {
  /** The full wording, read by screen readers and shown as the tooltip. */
  label: string
  /** From `STATUS_TONE.session`. */
  dot: Tone
}

/** The list's status wording on top of `STATUS_TONE.session`: progress and open-comment counts fold into the label. Review states only; the run is its own chip. */
export function statusPill(summary: Omit<StatusSource, 'status'> & { status: ReviewStatus }): StatusPillSpec {
  const { tone: dot, label } = STATUS_TONE.session(summary.status)
  const base = { dot }
  if (statusWord(summary) === 'Nothing to review') return { ...base, label: 'Nothing to review' }
  switch (summary.status) {
    case 'in-progress':
      return { ...base, label: `${label} · ${summary.progress.reviewed} of ${summary.progress.total}` }
    case 'sent': {
      const decision = sentDecisionLabel(summary.lastSend)
      // Approve went out but a file is no longer approved (Approved needs all of them): say so instead of "Changes sent · Approve".
      if (summary.lastSend?.decision === 'approve') return { ...base, label: `${label} · Approve, not all files approved` }
      return { ...base, label: decision ? `${label} · ${decision}` : label }
    }
    case 'updated':
      return { ...base, label: summary.openComments > 0 ? `${label} · ${pluralize(summary.openComments, 'open comment')}` : label }
    default:
      return { ...base, label }
  }
}

function sentDecisionLabel(lastSend: SessionSummary['lastSend']): string | null {
  if (!lastSend || lastSend.decision === 'undecided') return null
  return DECISION_LABELS[lastSend.decision]
}

/** The short status word of the list row: the tone's label, or "Nothing to review" for a session without files. */
export function statusWord(summary: Pick<SessionSummary, 'progress'> & { status: ReviewStatus }): string {
  if (summary.status === 'unreviewed' && summary.progress.total === 0) return 'Nothing to review'
  return STATUS_TONE.session(summary.status).label
}

export function countByFilter(items: readonly SessionListItem[], archivedCount = 0): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: items.length,
    awaiting: 0,
    'in-progress': 0,
    ready: 0,
    sent: 0,
    updated: 0,
    approved: 0,
    archived: archivedCount,
  }
  for (const item of items) {
    if (isLiveSummary(item)) counts[statusFilterOf(reviewStatusOf(statusSourceOf(item)))] += 1
  }
  return counts
}

/** Live items only: the `archived` filter shows the archived list instead, so nothing live matches it. */
export function matchesFilter(item: SessionListItem, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'archived') return false
  return isLiveSummary(item) && statusFilterOf(reviewStatusOf(statusSourceOf(item))) === filter
}

/** Newest activity first (the server already orders; sorting again keeps a refetch stable), broken rows last. */
export function byLastActivity(a: SessionListItem, b: SessionListItem): number {
  const aOk = isLiveSummary(a)
  const bOk = isLiveSummary(b)
  if (aOk && bOk) return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  if (aOk !== bOk) return aOk ? -1 : 1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}
