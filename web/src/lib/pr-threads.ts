import { anchorInPatch, type LineAnchor, type PatchLine, type PrCommentView } from '@review-dash/shared'

/** A GitHub review thread: the root comment and the replies under it (display order). */
export interface PrThread {
  root: PrCommentView
  replies: PrCommentView[]
}

/** The threads of a view list in display order; a reply whose root is not in the list becomes a thread of its own. */
export function groupPrThreads(views: readonly PrCommentView[]): PrThread[] {
  const threads = new Map<string, PrThread>()
  for (const view of views) {
    const parent = view.inReplyTo === null ? undefined : threads.get(view.inReplyTo)
    if (view.isReply && parent) parent.replies.push(view)
    else threads.set(view.id, { root: view, replies: [] })
  }
  return [...threads.values()]
}

/** The line threads of one file (`path`): what its card shows inline or in its footer group. */
export function threadsForPath(threads: readonly PrThread[], path: string): PrThread[] {
  return threads.filter((thread) => thread.root.kind === 'line' && thread.root.path === path)
}

export interface PrFileCounts {
  total: number
  open: number
}

/** Per file: how many threads, and how many still open. */
export function prCountsByPath(threads: readonly PrThread[]): Map<string, PrFileCounts> {
  const counts = new Map<string, PrFileCounts>()
  for (const { root } of threads) {
    if (root.kind !== 'line' || root.path === null) continue
    const entry = counts.get(root.path) ?? { total: 0, open: 0 }
    entry.total += 1
    if (root.status === 'open') entry.open += 1
    counts.set(root.path, entry)
  }
  return counts
}

/** The thread's anchor: its root's current line, else null (outdated, deleted, file-level). */
function anchorOf(thread: PrThread): LineAnchor | null {
  return thread.root.anchor
}

export interface PrPlacement {
  /** Threads whose line is in the diff, with the anchor they hang under. */
  placed: { anchor: LineAnchor; thread: PrThread }[]
  /** Everything else: outdated, file-level, or a line the diff does not show. */
  unplaced: PrThread[]
}

/** Splits a file's threads into those that hang under a line of `rows` and those that cannot. */
export function placePrThreads(rows: readonly PatchLine[], threads: readonly PrThread[]): PrPlacement {
  const placement: PrPlacement = { placed: [], unplaced: [] }
  for (const thread of threads) {
    const anchor = anchorOf(thread)
    if (anchor !== null && anchorInPatch(rows, anchor)) placement.placed.push({ anchor, thread })
    else placement.unplaced.push(thread)
  }
  return placement
}
