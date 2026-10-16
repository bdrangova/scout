import { effectiveVerdict, fileIsUpdated, type TreeFile, type Verdict } from '@review-dash/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { indexByPath } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { FileTile } from './FileTile'

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

/** A file with no verdict but an open comment counts as reviewed, so it gets its own bucket. */
type Category = Verdict | 'commented'
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

/** Every file as a compact tile in a responsive grid, with a verdict filter (with counts) above. */
export function FileGrid({ files, reviewFiles = files, currentPath, onOpen, onApprove }: FileGridProps) {
  const { fileReview, comments } = useReview()
  const [filter, setFilter] = useState<GridFilter>('all')
  const gridRef = useRef<HTMLUListElement>(null)
  const reviewByPath = useMemo(() => indexByPath(reviewFiles), [reviewFiles])

  const openCommentsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.target.kind !== 'file' || comment.status !== 'open' || comment.target.ref === null) continue
      counts.set(comment.target.ref, (counts.get(comment.target.ref) ?? 0) + 1)
    }
    return counts
  }, [comments])

  // A scope file without a full-diff entry (a later change undid it) has no verdict to show.
  const verdictOf = (file: TreeFile): Verdict => {
    const reviewFile = reviewByPath.get(file.path)
    return reviewFile ? effectiveVerdict(fileReview(file.path), reviewFile) : 'none'
  }
  const categories = files.map((file): Category => {
    const verdict = verdictOf(file)
    return verdict === 'none' && reviewByPath.has(file.path) && (openCommentsByPath.get(file.path) ?? 0) > 0 ? 'commented' : verdict
  })
  const counts: Record<Category, number> = { none: 0, commented: 0, approved: 0, rejected: 0 }
  for (const category of categories) counts[category] += 1
  const shown = files.filter((_, index) => filter === 'all' || categories[index] === filter)

  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-path="${escapeAttribute(currentPath)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [currentPath])

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-5 md:px-6">
      <div role="group" aria-label="Show files" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card text-[13px]">
        {FILTERS.map((option) => {
          const active = option.id === filter
          const count = option.id === 'all' ? files.length : counts[option.id]
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.id)}
              className={cn(
                'h-8 px-3 font-medium whitespace-nowrap transition outline-none first:rounded-l-lg last:rounded-r-lg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No {filter === 'none' ? 'unreviewed' : filter} files.</p>
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
