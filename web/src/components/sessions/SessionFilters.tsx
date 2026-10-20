import { Archive, List } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Pill, Segmented, SegmentedItem } from '@/components/ui/segmented'
import { STATUS_FILTERS, type StatusFilter } from '@/lib/session-status'
import { STATUS_TONE } from '@/lib/status-tone'

/** Unpressed chips tint their icon and count with the state colour; a pressed chip is ink-filled like every chooser. */
const UNPRESSED_ACCENT = '[&:not([aria-pressed=true])_svg]:text-(--chip) [&:not([aria-pressed=true])_[data-slot=segmented-count]]:text-(--chip)'

/** The status chips; Archived is another dimension and gets its own control to the right. */
const STATUS_CHIPS = STATUS_FILTERS.filter((entry) => entry.id !== 'archived')

interface SessionFiltersProps {
  filter: StatusFilter
  counts: Record<StatusFilter, number>
  onFilter: (filter: StatusFilter) => void
  onToggleArchived: () => void
}

/** Icon-first status pills (with the word at `lg`+) and counts (`All · 6` is each one's accessible name), plus the flat Archived toggle. */
export function SessionFilters({ filter, counts, onFilter, onToggleArchived }: SessionFiltersProps) {
  return (
    <>
      <Segmented variant="pills" aria-label="Filter by status" className="pt-0.5">
        {STATUS_CHIPS.map((entry) => {
          const spec = entry.status ? STATUS_TONE.session(entry.status) : null
          const Icon = spec?.icon ?? List
          return (
            <SegmentedItem
              key={entry.id}
              pressed={entry.id === filter}
              count={counts[entry.id]}
              onClick={() => onFilter(entry.id)}
              aria-label={`${entry.label} · ${counts[entry.id]}`}
              title={entry.label}
              className={spec ? UNPRESSED_ACCENT : undefined}
              style={spec ? ({ '--chip': `var(--st-${spec.hue})` } as CSSProperties) : undefined}
            >
              <Icon aria-hidden />
              <span className="hidden lg:inline">{entry.label}</span>
            </SegmentedItem>
          )
        })}
      </Segmented>
      <Pill
        pressed={filter === 'archived'}
        count={counts.archived}
        onClick={onToggleArchived}
        aria-label={`Archived · ${counts.archived}`}
        title="Archived"
        className="ml-auto border-transparent bg-transparent text-ink-muted hover:text-ink"
      >
        <Archive aria-hidden />
        <span className="hidden lg:inline">Archived</span>
      </Pill>
    </>
  )
}
