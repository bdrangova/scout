import type { SessionListItem } from '@review-dash/shared'
import { TriangleAlert } from 'lucide-react'

export function BrokenRow({ item }: { item: Extract<SessionListItem, { error: string }> }) {
  return (
    <li aria-label={`Broken session ${item.id}`} className="flex min-w-0 flex-col gap-1 rounded-md border-fine border-dashed border-line px-4 py-3 text-ink-muted">
      <span className="flex min-w-0 items-center gap-2 text-xs"><TriangleAlert aria-hidden className="size-3.5 shrink-0" /><span className="truncate font-mono">{item.id}</span><span className="sr-only">Broken</span></span>
      <span className="text-xs break-words">{item.error}</span>
    </li>
  )
}
