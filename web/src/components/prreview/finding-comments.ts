import { hashPrBody, type CommentWithStatus, type LineAnchor, type PrFinding } from '@scout/shared'
import { useMemo } from 'react'
import { encodePath } from '@/lib/paths'
import type { PrThread } from '@/lib/pr-threads'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { usePrComments } from '@/state/pr-comments-context'
import { useCurrentPrReport } from './pr-review-context'
import type { EvidenceItem } from './reproduction-evidence'

/** Same side of the diff and the line ranges touch. */
export function anchorsOverlap(a: LineAnchor, b: LineAnchor): boolean {
  return a.side === b.side && a.line <= (b.endLine ?? b.line) && b.line <= (a.endLine ?? a.line)
}

export interface FindingComments {
  /** GitHub threads on the finding's lines. */
  threads: PrThread[]
  /** The reviewer's own line comments on the finding's lines. */
  comments: CommentWithStatus[]
}

/** Everything said about a finding's lines besides the suggestion itself: GitHub threads and your line comments. */
export function findingCommentsOf(finding: PrFinding, threadsFor: (path: string) => PrThread[], fileComments: readonly CommentWithStatus[]): FindingComments {
  return {
    threads: threadsFor(finding.path).filter((thread) => thread.root.anchor !== null && anchorsOverlap(thread.root.anchor, finding.anchor)),
    comments: fileComments.filter((comment) => comment.target.anchor !== undefined && anchorsOverlap(comment.target.anchor, finding.anchor)),
  }
}

export function useFindingComments(finding: PrFinding): FindingComments {
  const { threadsFor } = usePrComments()
  const { commentsFor } = useReview()
  return findingCommentsOf(finding, threadsFor, commentsFor({ kind: 'file', ref: finding.path }))
}

/**
 * Per finding: how much has been said about it (your notes on the suggestion, your open comments and the
 * GitHub threads on its lines). The rail's counts and its "only commented" toggle read it.
 */
export function useFindingCommentCounts(findings: readonly PrFinding[]): ReadonlyMap<string, number> {
  const { threadsFor } = usePrComments()
  const { commentsFor, state } = useReview()
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const finding of findings) {
      const { threads, comments } = findingCommentsOf(finding, threadsFor, commentsFor({ kind: 'file', ref: finding.path }))
      const notes = state.review.prProposals?.[finding.id]?.notes.length ?? 0
      const total = notes + threads.length + comments.filter((comment) => comment.status === 'open').length
      if (total > 0) counts.set(finding.id, total)
    }
    return counts
  }, [findings, threadsFor, commentsFor, state.review.prProposals])
}

/** The media URL of a reproduction item, pinned to the report revision so a new report never shows stale bytes. */
export function useEvidenceSrc(): (item: EvidenceItem) => string {
  const { sessionId } = useSessionContext()
  const { report } = useCurrentPrReport()
  const revision = report ? hashPrBody(JSON.stringify(report)) : ''
  return (item) => `/api/sessions/${encodeURIComponent(sessionId)}/pr-review/media/${encodePath(item.path)}?revision=${revision}`
}
