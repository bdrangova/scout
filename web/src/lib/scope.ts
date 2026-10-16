import { ScopeSchema, UNCOMMITTED_SCOPE, type ChangeStats, type Commit, type CommitList, type Scope, type TreeFile } from '@review-dash/shared'

/** `?commit=<sha>` or `?commit=uncommitted`; absent means the full diff. */
export const SCOPE_PARAM = 'commit'

/** The URL's scope, or null for the full diff (also for a value that is not a scope). */
export function parseScope(value: string | null | undefined): Scope | null {
  const parsed = ScopeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The scope the loaded commit list can serve: a commit sha must be in the list and `uncommitted`
 * needs a dirty tree, else the full diff. Unknown (`list` null) keeps the scope as it is.
 */
export function resolveScope(scope: Scope | null, list: CommitList | null): Scope | null {
  if (scope === null || list === null) return scope
  if (scope === UNCOMMITTED_SCOPE) return list.uncommitted === null ? null : scope
  return list.commits.some((commit) => commit.sha === scope) ? scope : null
}

/** `params` with the scope set or removed, for an in-page navigation that keeps everything else (`mode`). */
export function withScope(params: URLSearchParams, scope: Scope | null): URLSearchParams {
  const next = new URLSearchParams(params)
  if (scope === null) next.delete(SCOPE_PARAM)
  else next.set(SCOPE_PARAM, scope)
  return next
}

/** `?a=b` or the empty string. */
export function searchString(params: URLSearchParams): string {
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

export type TimelineItem =
  | { kind: 'full'; scope: null }
  | { kind: 'commit'; scope: Scope; commit: Commit }
  | { kind: 'uncommitted'; scope: Scope; stats: ChangeStats }

/** What the strip leaves out: merge commits, except the selected one (the selection is never hidden). */
export interface TimelineFilter {
  hideMerges: boolean
  selected: Scope | null
}

/**
 * The timeline's items in order: the full diff, the commits oldest first, the uncommitted changes
 * when any. With `filter.hideMerges` the merge commits are dropped, bar the selected one.
 */
export function timelineItems(list: CommitList | null, filter?: TimelineFilter): TimelineItem[] {
  const items: TimelineItem[] = [{ kind: 'full', scope: null }]
  if (list === null) return items
  for (const commit of list.commits) {
    if (filter?.hideMerges && commit.merge && commit.sha !== filter.selected) continue
    items.push({ kind: 'commit', scope: commit.sha, commit })
  }
  if (list.uncommitted !== null) items.push({ kind: 'uncommitted', scope: UNCOMMITTED_SCOPE, stats: list.uncommitted })
  return items
}

/** The scope `delta` items away from `scope` in the timeline (clamped at both ends), over the same items the strip shows. */
export function stepScope(list: CommitList | null, scope: Scope | null, delta: number, hideMerges = false): Scope | null {
  const items = timelineItems(list, { hideMerges, selected: scope })
  const index = Math.max(
    0,
    items.findIndex((item) => item.scope === scope),
  )
  const target = items[Math.min(items.length - 1, Math.max(0, index + delta))]
  return target?.scope ?? null
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** What the cards, the grid and the tree need to review a scope's files against the full diff. */
export interface ScopeReview {
  scope: Scope
  /**
   * The full-diff file of a path: what a verdict is pinned to and where the review state is read
   * from. Null when the scope's change has no net effect in the full diff (a later commit undid it).
   */
  fullFile: (path: string) => TreeFile | null
  /** Move on from `path` after a verdict or a comment (the reducer's own advance follows the full diff). */
  advanceFrom: (path: string) => void
}

/** `files` indexed by path. */
export function indexByPath(files: readonly TreeFile[]): Map<string, TreeFile> {
  return new Map(files.map((file) => [file.path, file]))
}
