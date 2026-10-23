import type { Comment, Review } from '../schemas/review.ts'
import type { TestRunIndex } from '../schemas/test-run.ts'
import { isItemComment } from './status.ts'

/** A test run's `run-file` refs (videos, screenshots, data) to the scenario holding each, first holder wins (as the Submit page lists them). */
export function runFileOwners(index: Pick<TestRunIndex, 'scenarios'>): Map<string, string> {
  const owners = new Map<string, string>()
  for (const scenario of index.scenarios) {
    const { videos, screenshots, data } = scenario.evidence
    for (const item of [...videos, ...screenshots, ...data]) if (!owners.has(item.path)) owners.set(item.path, scenario.id)
  }
  return owners
}

/** The `review.files` key a comment concerns: a file or scenario comment its ref, a `run-file` comment the scenario holding the file; null otherwise. */
export function commentItem(comment: Comment, owners: ReadonlyMap<string, string> = new Map()): string | null {
  const { kind, ref } = comment.target
  if (ref === null) return null
  if (isItemComment(kind)) return ref
  if (kind === 'run-file') return owners.get(ref) ?? null
  return null
}

/**
 * A rerun (the agent answered comments, or the session was published again) puts every approved item with one of `comments`
 * back to no verdict, so the reviewer looks at it again. `viewed` stays. The same review when nothing changes.
 */
export function unapproveCommented(review: Review, comments: readonly Comment[], now: string, owners?: ReadonlyMap<string, string>): Review {
  const files = { ...review.files }
  let changed = false
  for (const comment of comments) {
    const item = commentItem(comment, owners)
    const entry = item === null ? undefined : files[item]
    if (item === null || entry?.verdict !== 'approved') continue
    files[item] = { verdict: 'none', fingerprint: null, viewed: entry.viewed }
    changed = true
  }
  return changed ? { ...review, files, updatedAt: now } : review
}

/** Comments the reviewer wrote, edited or reopened after `since` (an ISO time). */
export function commentsSince(review: Review, since: string): Comment[] {
  const after = Date.parse(since)
  return review.comments.filter((comment) =>
    [comment.createdAt, comment.updatedAt, comment.reopenedAt].some((at) => at !== null && Date.parse(at) > after),
  )
}
