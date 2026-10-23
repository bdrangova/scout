import { Select } from '@base-ui/react/select'
import { Check, ChevronDown, ListFilter } from 'lucide-react'
import { STATUS_FILTERS, type StatusFilter } from '@/lib/session-status'
import { SessionStatusLabel } from './SessionStatusLabel'

const OPTIONS = STATUS_FILTERS.filter((entry) => entry.id !== 'archived')
export function SessionStatusSelect({ filter, counts, onFilter }: { filter: StatusFilter; counts: Record<StatusFilter, number>; onFilter: (filter: StatusFilter) => void }) {
  const current = OPTIONS.find((entry) => entry.id === filter) ?? OPTIONS[0]!
  return (
    <Select.Root value={filter} onValueChange={(value) => { if (value) onFilter(value) }}>
      <Select.Trigger aria-label="Review status" className="flex h-9 min-w-48 items-center gap-3 rounded-xl border-fine border-line bg-surface px-3 text-xs font-semibold text-ink max-sm:w-full">
        <Select.Value className="flex flex-1 items-center">{current.status ? <SessionStatusLabel status={current.status} /> : <span className="inline-flex items-center gap-1.5"><ListFilter aria-hidden className="size-3.5" />All statuses</span>}</Select.Value>
        <Select.Icon><ChevronDown aria-hidden className="size-4" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} align="end" alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="min-w-64 rounded-xl border-fine border-line bg-surface p-1.5 text-ink shadow-panel outline-none">
            <Select.List className="max-h-(--available-height) overflow-y-auto">
              {OPTIONS.map((entry) => {
                const label = entry.id === 'all' ? 'All statuses' : entry.id === 'sent' ? 'Review sent' : entry.label
                return <Select.Item key={entry.id} value={entry.id} label={label} aria-label={`${label} (${counts[entry.id]})`} className="flex cursor-default items-center gap-3 rounded-md px-2 py-2.5 outline-none select-none data-highlighted:bg-hover">
                  <Select.ItemText className="flex flex-1 items-center">{entry.status ? <SessionStatusLabel status={entry.status} /> : <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><ListFilter aria-hidden className="size-3.5" />All statuses</span>}</Select.ItemText>
                  <span aria-hidden className="text-xs text-ink-muted tabular-nums">{counts[entry.id]}</span>
                  <span className="inline-flex size-3.5"><Select.ItemIndicator><Check aria-hidden className="size-3.5" /></Select.ItemIndicator></span>
                </Select.Item>
              })}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
