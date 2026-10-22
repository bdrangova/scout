import type { Comment, CommentTargetKind, Decision } from '../schemas/review.ts'

const REQUIRED_RESPONSE =
  'Address every open comment by changing the code in the working tree; the dashboard reads it live, there is nothing to publish. ' +
  'For each comment run `ai-review resolve <id> --comment c<n> --status resolved --note "…"` ' +
  '(or `--status open --note "…"` to reply without resolving).'

/** The `## Required response` body; `patchPath` (session-relative) is named only when the send carries a diff. */
export function requiredResponseText(sessionId: string, patchPath: string | null): string {
  const text = patchPath === null ? REQUIRED_RESPONSE : `${REQUIRED_RESPONSE} The exact diff the reviewer saw is in \`${patchPath}\` (relative to the session folder).`
  return text.replaceAll('<id>', sessionId)
}

export function decisionLabel(decision: Decision): string {
  return decision.toUpperCase().replaceAll('-', ' ')
}

export function formatTimestamp(sec: number): string {
  const whole = Math.floor(sec)
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function groupByRef(comments: readonly Comment[], kind: Exclude<CommentTargetKind, 'overall'>): Map<string, Comment[]> {
  const groups = new Map<string, Comment[]>()
  for (const comment of comments) {
    if (comment.target.kind !== kind || comment.target.ref === null) continue
    const group = groups.get(comment.target.ref)
    if (group) group.push(comment)
    else groups.set(comment.target.ref, [comment])
  }
  return groups
}

/** Refs in known order first, then any no longer known in first-comment order. */
export function orderedRefs(groups: Map<string, Comment[]>, known: readonly string[]): string[] {
  const ordered = known.filter((ref) => groups.has(ref))
  const seen = new Set(ordered)
  for (const ref of groups.keys()) {
    if (!seen.has(ref)) ordered.push(ref)
  }
  return ordered
}
