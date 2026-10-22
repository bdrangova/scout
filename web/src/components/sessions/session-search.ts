import type { ArchivedSession, SessionListItem } from '@review-dash/shared'

/** Match every search word across identity fields; no extra network request is needed. */
export function matchesSessionSearch(item: SessionListItem | ArchivedSession, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const text = ('error' in item ? `${item.id} ${item.error}` : [item.title, item.repo.path, item.repo.branch, item.repo.baseRef, ...item.tickets.map((ticket) => ticket.key)].join(' ')).toLowerCase()
  return words.every((word) => text.includes(word))
}
