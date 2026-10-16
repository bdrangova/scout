import { effectiveVerdict, fileIsUpdated, type TreeFile } from '@review-dash/shared'
import { X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { allFolderIds, ancestorsOf, buildFileTree, countReviewed, filterTree, flattenTree, type FlatRow } from '@/lib/file-tree'
import { indexByPath } from '@/lib/scope'
import { useReview } from '@/state/review-context'
import { FileTreeRow, type FileRowState } from './FileTreeRow'

export interface FileTreeProps {
  files: readonly TreeFile[]
  /** The files the review state belongs to (the full diff) when `files` is one scope's list. Defaults to `files`. */
  reviewFiles?: readonly TreeFile[]
  currentPath: string | null
  onSelect: (path: string) => void
}

/** Below this many files every folder starts open; above it only the way to the current file. */
export const EXPAND_ALL_BELOW = 60

function union(set: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  if (ids.every((id) => set.has(id))) return set as Set<string>
  return new Set([...set, ...ids])
}

function escapeAttribute(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

/**
 * Filter box, expand/collapse, and the folder/file rows as one `tree`. The current file is kept
 * in view and its folders open whenever it changes; Up/Down/Left/Right/Enter move inside the tree.
 */
export function FileTree({ files, reviewFiles = files, currentPath, onSelect }: FileTreeProps) {
  const { fileReview, comments } = useReview()
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filtering = deferredQuery.trim() !== ''

  const tree = useMemo(() => buildFileTree(files), [files])
  const filtered = useMemo(() => filterTree(tree, deferredQuery), [tree, deferredQuery])
  const reviewByPath = useMemo(() => indexByPath(reviewFiles), [reviewFiles])
  const openCommentsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.target.kind !== 'file' || comment.status !== 'open' || comment.target.ref === null) continue
      counts.set(comment.target.ref, (counts.get(comment.target.ref) ?? 0) + 1)
    }
    return counts
  }, [comments])

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (files.length < EXPAND_ALL_BELOW) return new Set(allFolderIds(tree))
    return new Set(currentPath === null ? [] : ancestorsOf(tree, currentPath))
  })
  const [focusedId, setFocusedId] = useState<string | null>(currentPath)

  // The current file moved (a card, a hotkey, the URL): open the folders above it. Done while
  // rendering so the row exists by the time the effect below scrolls to it.
  const [seenCurrent, setSeenCurrent] = useState(currentPath)
  if (seenCurrent !== currentPath) {
    setSeenCurrent(currentPath)
    if (currentPath !== null) {
      setExpanded((current) => union(current, ancestorsOf(tree, currentPath)))
      setFocusedId(currentPath)
    }
  }

  useEffect(() => {
    if (currentPath === null) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${escapeAttribute(currentPath)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [currentPath, filtered])

  const rows = useMemo(
    () => flattenTree(filtered, (id) => filtering || expanded.has(id)),
    [filtered, filtering, expanded],
  )
  const focusedRow = rows.find((row) => row.node.id === focusedId) ?? rows[0] ?? null

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
    }
  }

  function toggleFolder(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function activate(row: FlatRow) {
    if (row.node.kind === 'file') onSelect(row.node.id)
    else if (!filtering) toggleFolder(row.node.id)
  }

  function focusRow(id: string | null) {
    if (id === null) return
    setFocusedId(id)
    listRef.current?.querySelector<HTMLElement>(`[data-id="${escapeAttribute(id)}"]`)?.focus()
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, row: FlatRow, index: number) {
    const folder = row.node.kind === 'folder'
    const open = folder && (filtering || expanded.has(row.node.id))
    switch (event.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]?.node.id ?? null)
        break
      case 'ArrowUp':
        focusRow(rows[index - 1]?.node.id ?? null)
        break
      case 'ArrowRight':
        if (!folder) return
        if (open) focusRow(rows[index + 1]?.node.id ?? null)
        else toggleFolder(row.node.id)
        break
      case 'ArrowLeft':
        if (open && !filtering) toggleFolder(row.node.id)
        else focusRow(row.parentId)
        break
      case 'Home':
        focusRow(rows[0]?.node.id ?? null)
        break
      case 'End':
        focusRow(rows.at(-1)?.node.id ?? null)
        break
      case 'Enter':
      case ' ':
        activate(row)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-1.5 border-b px-3 py-2">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query !== '') {
                event.preventDefault()
                setQuery('')
              }
            }}
            placeholder="Filter files…"
            aria-label="Filter files"
            autoComplete="off"
            className="h-7 w-full rounded-md border bg-background px-2 pr-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Button variant="ghost" size="sm" disabled={filtering} onClick={() => setExpanded(new Set(allFolderIds(tree)))}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" disabled={filtering} onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
          {filtering && (
            <span className="ml-auto text-muted-foreground tabular-nums" aria-live="polite">
              {rows.filter((row) => row.node.kind === 'file').length} of {files.length}
            </span>
          )}
        </div>
      </div>
      <div ref={listRef} role="tree" aria-label="Changed files" className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {rows.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No files match.</p>}
        {rows.map((row, index) => (
          <FileTreeRow
            key={row.node.id}
            row={row}
            expanded={row.node.kind === 'folder' && (filtering || expanded.has(row.node.id))}
            current={row.node.id === currentPath}
            focused={focusedRow?.node.id === row.node.id}
            count={row.node.kind === 'folder' ? { reviewed: countReviewed(row.node.paths, isReviewed), total: row.node.paths.length } : undefined}
            state={row.node.kind === 'file' ? stateOf(row.node.file) : undefined}
            onActivate={() => activate(row)}
            onFocus={() => setFocusedId(row.node.id)}
            onKeyDown={(event) => onRowKeyDown(event, row, index)}
          />
        ))}
      </div>
    </div>
  )
}
