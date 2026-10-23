import { Archive, Search } from 'lucide-react'
import { SessionLayoutToggle } from './SessionLayoutToggle'
import type { SessionListLayout } from './session-list-layout'
import { Input } from '@/components/ui/input'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import type { SessionKind } from '@/lib/paths'
import type { StatusFilter } from '@/lib/session-status'
import { SessionStatusSelect } from './SessionStatusSelect'

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
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-1">
        <label className="relative min-w-0 max-sm:w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" value={query} onChange={(event) => onQuery(event.target.value)} aria-label="Search sessions" placeholder={kind === 'test-run' ? 'Search test runs…' : 'Search sessions…'} title={kind === 'test-run' ? 'Search by title, ticket, feature, area, or run folder' : 'Search by title, ticket, repository, or branch'} className="h-9 w-64 pl-9 max-sm:w-full" />
        </label>
        {!archived && <SessionStatusSelect filter={filter} counts={counts} onFilter={onFilter} />}
        <div className="max-sm:justify-self-end"><SessionLayoutToggle layout={layout} onLayout={onLayout} /></div>
      </div>
    </div>
  )
}
