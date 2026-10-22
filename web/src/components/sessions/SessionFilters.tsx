import { Archive, ChevronDown, Search } from 'lucide-react'
import { SessionLayoutToggle } from './SessionLayoutToggle'
import type { SessionListLayout } from './session-list-layout'
import { Input } from '@/components/ui/input'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import type { SessionKind } from '@/lib/paths'
import { STATUS_FILTERS, type StatusFilter } from '@/lib/session-status'

interface SessionFiltersProps {
  layout: SessionListLayout
  onLayout: (layout: SessionListLayout) => void
  kind?: SessionKind
  filter: StatusFilter
  counts: Record<StatusFilter, number>
  onFilter: (filter: StatusFilter) => void
  onToggleArchived: () => void
  query: string
  onQuery: (value: string) => void
}

/** Archive is a separate view; lifecycle filtering applies only to current sessions. */
export function SessionFilters({ kind = 'code-review', layout, onLayout, filter, counts, onFilter, onToggleArchived, query, onQuery }: SessionFiltersProps) {
  const archived = filter === 'archived'
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented aria-label="Session view">
        <SegmentedItem pressed={!archived} count={counts.all} aria-label={`Sessions · ${counts.all}`} onClick={() => archived && onToggleArchived()}>Sessions</SegmentedItem>
        <SegmentedItem pressed={archived} count={counts.archived} aria-label={`Archived · ${counts.archived}`} onClick={() => !archived && onToggleArchived()}>
          <Archive aria-hidden />Archived
        </SegmentedItem>
      </Segmented>
      <SessionLayoutToggle layout={layout} onLayout={onLayout} />
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-1">
        <label className="relative min-w-0 max-sm:w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" value={query} onChange={(event) => onQuery(event.target.value)} aria-label="Search sessions" placeholder={kind === 'test-run' ? 'Search test runs…' : 'Search sessions…'} title={kind === 'test-run' ? 'Search by title, ticket, feature, area, or run folder' : 'Search by title, ticket, repository, or branch'} className="h-9 w-64 pl-9 max-sm:w-full" />
        </label>
        {!archived && (
          <div className="relative min-w-0">
            <select aria-label="Review status" value={filter} onChange={(event) => onFilter(event.target.value as StatusFilter)} className="block h-9 w-full appearance-none rounded-xl border-fine border-line bg-surface pr-10 pl-3 text-xs font-semibold text-ink">
              {STATUS_FILTERS.filter((entry) => entry.id !== 'archived').map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.id === 'all' ? 'All statuses' : entry.id === 'sent' ? 'Review sent' : entry.label}{entry.id === 'all' ? '' : ` (${counts[entry.id]})`}</option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" />
          </div>
        )}
      </div>
    </div>
  )
}
