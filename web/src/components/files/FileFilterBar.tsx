import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { FileTypeFilter } from './FileTypeFilter'
import { FILE_FILTERS, type FileFilterState } from './useFileFilter'

/** The Files page's filters above every mode: verdict buckets with counts, and the file-type multiselect. */
export function FileFilterBar({ state }: { state: FileFilterState }) {
  const { filter, setFilter, counts, typeOptions, types } = state
  return (
    <div className="flex items-start justify-between gap-4">
      <Segmented aria-label="Show files" className="max-w-full overflow-x-auto overflow-y-hidden">
        {FILE_FILTERS.map((option) => (
          <SegmentedItem
            key={option.id}
            pressed={option.id === filter}
            count={counts[option.id]}
            onClick={() => setFilter(option.id)}
            className="h-7 px-3"
          >
            {option.label}
          </SegmentedItem>
        ))}
      </Segmented>
      {typeOptions.length > 0 && <FileTypeFilter options={typeOptions} selected={types.selected} onToggle={types.toggle} onClear={types.clear} />}
    </div>
  )
}
