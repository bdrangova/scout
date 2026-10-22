import { fileIsUpdated, type TreeFile } from '@review-dash/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { usePrComments } from '@/state/pr-comments-context'
import { useReview } from '@/state/review-context'
import { FileTile } from './FileTile'
import { FileTypeFilter } from './FileTypeFilter'
import { fileTypeOptions, filterByTypes } from './fileTypeOptions'
import { useFileCategories, type Category } from './useFileCategories'
import { useFileTypeFilter } from './useFileTypeFilter'

export interface FileGridProps {
  files: readonly TreeFile[]
  /**
   * The files the review state belongs to (the full diff) when `files` is one scope's list;
   * verdicts are read against their fingerprints. Defaults to `files`.
   */
  reviewFiles?: readonly TreeFile[]
  currentPath: string
  /** Open the file in a card mode. */
  onOpen: (path: string) => void
  onApprove: (file: TreeFile) => void
}

type GridFilter = 'all' | Category

const FILTERS: readonly { id: GridFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'Unreviewed' },
  { id: 'commented', label: 'Commented' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

function escapeAttribute(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/**
 * Every file as a compact tile in a responsive grid. Above it a verdict filter (with counts) and a
 * file-type multiselect; the verdict counts follow the type selection, which lives in `?types=`.
 */
export function FileGrid({ files, reviewFiles = files, currentPath, onOpen, onApprove }: FileGridProps) {
  const { fileReview } = useReview()
  const { fileCounts } = usePrComments()
  const [filter, setFilter] = useState<GridFilter>('all')
  const types = useFileTypeFilter()
  const gridRef = useRef<HTMLUListElement>(null)
  const { reviewByPath, openCommentsByPath, verdictOf, categoryOf } = useFileCategories(reviewFiles)

  const typeOptions = useMemo(() => fileTypeOptions(files), [files])
  const typed = useMemo(() => filterByTypes(files, types.selected), [files, types.selected])
  const counts: Record<Category, number> = { none: 0, commented: 0, approved: 0, rejected: 0 }
  for (const file of typed) counts[categoryOf(file)] += 1
  const shown = filter === 'all' ? typed : typed.filter((file) => categoryOf(file) === filter)
  const filtering = filter !== 'all' || types.selected.length > 0

  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-path="${escapeAttribute(currentPath)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [currentPath])

  function clearFilters() {
    setFilter('all')
    types.clear()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-5 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <Segmented aria-label="Show files" className="max-w-full overflow-x-auto overflow-y-hidden">
          {FILTERS.map((option) => (
            <SegmentedItem
              key={option.id}
              pressed={option.id === filter}
              count={option.id === 'all' ? typed.length : counts[option.id]}
              onClick={() => setFilter(option.id)}
              className="h-7 px-3"
            >
              {option.label}
            </SegmentedItem>
          ))}
        </Segmented>
        {typeOptions.length > 0 && (
          <FileTypeFilter options={typeOptions} selected={types.selected} onToggle={types.toggle} onClear={types.clear} />
        )}
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-muted">
          <p>{filtering ? 'No files match these filters.' : 'No files.'}</p>
          {filtering && (
            <Button size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <ul ref={gridRef} aria-label="All files" className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {shown.map((file) => {
            const review = fileReview(file.path)
            const reviewFile = reviewByPath.get(file.path)
            return (
              <FileTile
                key={file.path}
                file={file}
                current={file.path === currentPath}
                verdict={verdictOf(file)}
                viewed={review?.viewed ?? false}
                openComments={openCommentsByPath.get(file.path) ?? 0}
                prComments={fileCounts.get(file.path)}
                updated={reviewFile !== undefined && fileIsUpdated(review, reviewFile)}
                reviewable={reviewFile !== undefined}
                onOpen={() => onOpen(file.path)}
                onApprove={() => onApprove(file)}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
