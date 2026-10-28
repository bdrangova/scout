import type { WorktreeSummary } from '@scout/shared'

/** Every search word must appear in the name, branch, ticket, base, path or repository. */
export function matchesWorktreeSearch(item: WorktreeSummary, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const text = [item.name, item.branch, item.ticket, item.baseRef, item.path, item.mainRepo].filter(Boolean).join(' ').toLowerCase()
  return words.every((word) => text.includes(word))
}
