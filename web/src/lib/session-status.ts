import type { SessionListItem, SessionStatus, SessionSummary } from '@review-dash/shared'
import { pluralize } from './format'

export type StatusTone = 'info' | 'neutral' | 'warn' | 'approve'

export type StatusFilter = 'all' | 'awaiting' | 'in-progress' | 'sent' | 'updated' | 'approved' | 'archived'

export const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting review' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'sent', label: 'Sent' },
  { id: 'updated', label: 'Updated' },
  { id: 'approved', label: 'Approved' },
  /** Archived sessions come from a separate fetch (`/sessions/archived`); `all` never includes them. */
  { id: 'archived', label: 'Archived' },
]

export function isSessionSummary(item: SessionListItem): item is SessionSummary {
  return !('error' in item)
}

/** `unreviewed` → Awaiting review, `sent` and `agent-working` → Sent, the rest map 1:1. */
export function statusFilterOf(status: SessionStatus): Exclude<StatusFilter, 'all'> {
  switch (status) {
    case 'unreviewed':
      return 'awaiting'
    case 'in-progress':
      return 'in-progress'
    case 'sent':
    case 'agent-working':
      return 'sent'
    case 'updated':
      return 'updated'
    case 'approved':
      return 'approved'
  }
}

export interface StatusPillSpec {
  label: string
  tone: StatusTone
  /** The dot colour when it differs from the tone (Sent · Claude Code working uses an info dot). */
  dotTone?: StatusTone
}

/** The mock's pill wording. */
export function statusPill(summary: Pick<SessionSummary, 'status' | 'progress' | 'openComments'>): StatusPillSpec {
  switch (summary.status) {
    case 'unreviewed':
      return { label: 'Awaiting review', tone: 'info' }
    case 'in-progress':
      return {
        label: `In progress · ${summary.progress.reviewed} of ${summary.progress.total}`,
        tone: 'neutral',
      }
    case 'sent':
      return { label: 'Sent', tone: 'neutral', dotTone: 'info' }
    case 'agent-working':
      return { label: 'Sent · Claude Code working', tone: 'neutral', dotTone: 'info' }
    case 'updated':
      return {
        label:
          summary.openComments > 0
            ? `Updated · ${pluralize(summary.openComments, 'open comment')}`
            : 'Updated',
        tone: 'warn',
      }
    case 'approved':
      return { label: 'Approved', tone: 'approve' }
  }
}

export function countByFilter(items: readonly SessionListItem[], archivedCount = 0): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: items.length,
    awaiting: 0,
    'in-progress': 0,
    sent: 0,
    updated: 0,
    approved: 0,
    archived: archivedCount,
  }
  for (const item of items) {
    if (isSessionSummary(item)) counts[statusFilterOf(item.status)] += 1
  }
  return counts
}

/** Live items only: the `archived` filter shows the archived list instead, so nothing live matches it. */
export function matchesFilter(item: SessionListItem, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'archived') return false
  return isSessionSummary(item) && statusFilterOf(item.status) === filter
}
