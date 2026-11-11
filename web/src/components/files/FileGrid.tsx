import { fileIsUpdated, type TreeFile } from '@scout/shared'
import { useEffect, useRef } from 'react'
import { usePrComments } from '@/state/pr-comments-context'
import { useReview } from '@/state/review-context'
import { useVerdictAction } from '@/components/diff/useVerdictAction'
import { FileTile } from './FileTile'
import { useFileCategories } from './useFileCategories'

export interface FileGridProps {
  /** Already through the page's filters. */
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

function escapeAttribute(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/** Every file as a compact tile in a responsive grid; the filters sit above, on the page (`FileFilterBar`). */
export function FileGrid({ files, reviewFiles = files, currentPath, onOpen, onApprove }: FileGridProps) {
  const { fileReview } = useReview()
  const sendVerdict = useVerdictAction()
  const { fileCounts } = usePrComments()
  const gridRef = useRef<HTMLUListElement>(null)
  const { reviewByPath, openCommentsByPath, verdictOf } = useFileCategories(reviewFiles)

  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-path="${escapeAttribute(currentPath)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [currentPath])

  return (
    <ul ref={gridRef} aria-label="All files" className="m-0 grid list-none gap-3.5 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
      {files.map((file) => {
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
            onClearVerdict={() => {
              const verdict = verdictOf(file)
              if (reviewFile && verdict !== 'none') sendVerdict(file.path, verdict, reviewFile.fingerprint)
            }}
          />
        )
      })}
    </ul>
  )
}
