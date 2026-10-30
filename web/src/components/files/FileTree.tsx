import { effectiveVerdict, fileIsUpdated, journalLineNotesByFile, type TreeFile } from '@scout/shared'
import { useMemo, useRef, useState } from 'react'
import { countReviewed } from '@/lib/file-tree'
import { indexByPath } from '@/lib/scope'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'
import { usePrComments } from '@/state/pr-comments-context'
import { useJournalState } from '@/state/journal-context'
import { useSessionContext } from '@/lib/session-context'
import { useCommentedOnlyFilter } from '@/components/layout/commented-only'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { ContentSearch } from './ContentSearch'
import { FileTreeFilter } from './FileTreeFilter'
import { FileTreeHeader } from './FileTreeHeader'
import { FileTreeRow, type FileRowState } from './FileTreeRow'
import { PrFileFilter } from './PrFileFilter'
import { useFileTreeState } from './useFileTreeState'
import { usePrFileFilter } from './usePrFileFilter'

export interface FileTreeProps {
  /** Folded down to the header. */
  collapsed?: boolean
  onToggleCollapsed?: () => void
  files: readonly TreeFile[]
  /** The files the review state belongs to (the full diff) when `files` is one scope's list. Defaults to `files`. */
  reviewFiles?: readonly TreeFile[]
  currentPath: string | null
  onSelect: (path: string) => void
}

/**
 * The rail's Files block: the `Files · n` header with the one expand/collapse toggle, the filter
 * box, and the folder/file rows as one `tree` (see `useFileTreeState` for the keyboard handling).
 */
export function FileTree({ files, reviewFiles = files, currentPath, onSelect, collapsed = false, onToggleCollapsed = () => {} }: FileTreeProps) {
  const { fileReview, comments } = useReview()
  const listRef = useRef<HTMLDivElement>(null)
  const { fileCounts } = usePrComments()
  const { report } = useCurrentPrReport()
  const openCommentsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.target.kind !== 'file' || comment.status !== 'open' || comment.target.ref === null) continue
      counts.set(comment.target.ref, (counts.get(comment.target.ref) ?? 0) + 1)
    }
    return counts
  }, [comments])
  const { journal } = useJournalState()
  const notesByPath = useMemo(() => journalLineNotesByFile(journal), [journal])
  const prFilter = usePrFileFilter(files)
  const commented = useCommentedOnlyFilter(prFilter.files, (file) => openCommentsByPath.has(file.path) || notesByPath.has(file.path))
  const state = useFileTreeState(commented.items, currentPath, onSelect, listRef)
  const reviewByPath = useMemo(() => indexByPath(reviewFiles), [reviewFiles])
  const { sessionId } = useSessionContext()
  const [contentMode, setContentMode] = useState(false)
  const diffPaths = useMemo(() => new Set(files.map((f) => f.path)), [files])

  function isReviewed(path: string): boolean {
    const file = reviewByPath.get(path)
    return file !== undefined && (effectiveVerdict(fileReview(path), file) !== 'none' || (openCommentsByPath.get(path) ?? 0) > 0)
  }

  // A scope file without a full-diff entry (a later change undid it) has no verdict to show.
  function stateOf(file: TreeFile): FileRowState {
    const review = fileReview(file.path)
    const reviewFile = reviewByPath.get(file.path)
    return {
      verdict: reviewFile ? effectiveVerdict(review, reviewFile) : 'none',
      openComments: openCommentsByPath.get(file.path) ?? 0,
      updated: reviewFile !== undefined && fileIsUpdated(review, reviewFile),
      prComments: fileCounts.get(file.path),
      scoutNotes: notesByPath.get(file.path),
      proposals: report?.findings.filter((f) => f.path === file.path).length,
    }
  }

  const focusedRow = state.rows.find((row) => row.node.id === state.focusedId) ?? state.rows[0] ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileTreeHeader
        count={files.length}
        shown={commented.active ? commented.items.length : undefined}
        allExpanded={state.allExpanded}
        disabled={state.filtering}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        onExpandAll={state.expandAll}
        onCollapseAll={state.collapseAll}
      />
      {!collapsed && (
        <>
          {prFilter.threadCount > 0 && (
            <PrFileFilter total={files.length} threadCount={prFilter.threadCount} active={prFilter.active} onChange={prFilter.setActive} />
          )}
          <FileTreeFilter
            query={state.query}
            onChange={state.setQuery}
            matches={state.filtering && !contentMode ? { shown: state.matchCount, total: commented.items.length } : undefined}
            contents={contentMode}
            onToggleContents={() => setContentMode((on) => !on)}
            commented={contentMode ? undefined : <CommentedOnlyToggle count={commented.count} active={commented.active} onToggle={commented.toggle} />}
          />
          {contentMode ? <ContentSearch sessionId={sessionId} query={state.query.trim()} diffPaths={diffPaths} onSelect={onSelect} /> : <div ref={listRef} role="tree" aria-label="Changed files" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-0.5">
            {files.length === 0 && <p className="m-0 px-2 py-3 text-xs font-medium text-ink-muted">No files changed.</p>}
            {files.length > 0 && state.rows.length === 0 && <p className="m-0 px-2 py-3 text-xs font-medium text-ink-muted">No files match.</p>}
            {state.rows.map((row, index) => (
              <FileTreeRow
                key={row.node.id}
                row={row}
                expanded={row.node.kind === 'folder' && state.isExpanded(row.node.id)}
                current={row.node.id === currentPath}
                focused={focusedRow?.node.id === row.node.id}
                count={
                  row.node.kind === 'folder'
                    ? {
                        reviewed: countReviewed(row.node.paths, isReviewed),
                        total: row.node.paths.length,
                      }
                    : undefined
                }
                state={row.node.kind === 'file' ? stateOf(row.node.file) : undefined}
                onActivate={() => state.activate(row)}
                onFocus={() => state.setFocusedId(row.node.id)}
                onKeyDown={(event) => state.onRowKeyDown(event, row, index)}
              />
            ))}
          </div>}
        </>
      )}
    </div>
  )
}
