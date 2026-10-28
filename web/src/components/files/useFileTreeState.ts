import type { TreeFile } from '@scout/shared'
import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import { allFolderIds, ancestorsOf, buildFileTree, filterTree, flattenTree, type FlatRow, type TreeNode } from '@/lib/file-tree'

/** Below this many files every folder starts open; above it only the way to the current file. */
export const EXPAND_ALL_BELOW = 60

function union(set: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  if (ids.every((id) => set.has(id))) return set as Set<string>
  return new Set([...set, ...ids])
}

function escapeAttribute(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"')
}

export interface FileTreeState {
  tree: TreeNode[]
  /** The visible rows, in order. */
  rows: FlatRow[]
  query: string
  setQuery: (query: string) => void
  filtering: boolean
  /** Files among the visible rows (the `n of total` count while filtering). */
  matchCount: number
  isExpanded: (folderId: string) => boolean
  /** Every folder of the (unfiltered) tree is open: the toggle offers to collapse. */
  allExpanded: boolean
  expandAll: () => void
  collapseAll: () => void
  focusedId: string | null
  setFocusedId: (id: string | null) => void
  /** A click or Enter: select a file, toggle a folder (not while filtering, the match set decides). */
  activate: (row: FlatRow) => void
  onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, row: FlatRow, index: number) => void
}

/**
 * The tree's state: the filter, which folders are open, which row has the roving focus, and the
 * Up/Down/Left/Right/Home/End/Enter handling. The current file is kept in view and its folders open
 * whenever it changes.
 */
export function useFileTreeState(
  files: readonly TreeFile[],
  currentPath: string | null,
  onSelect: (path: string) => void,
  /** The `tree` element, for scrolling to and focusing rows. */
  listRef: RefObject<HTMLDivElement | null>,
): FileTreeState {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filtering = deferredQuery.trim() !== ''

  const tree = useMemo(() => buildFileTree(files), [files])
  const filtered = useMemo(() => filterTree(tree, deferredQuery), [tree, deferredQuery])
  const folderIds = useMemo(() => allFolderIds(tree), [tree])

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
  }, [currentPath, filtered, listRef])

  const isExpanded = (id: string) => filtering || expanded.has(id)
  const rows = useMemo(() => flattenTree(filtered, (id) => filtering || expanded.has(id)), [filtered, filtering, expanded])

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
    const open = folder && isExpanded(row.node.id)
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

  return {
    tree,
    rows,
    query,
    setQuery,
    filtering,
    matchCount: rows.filter((row) => row.node.kind === 'file').length,
    isExpanded,
    allExpanded: folderIds.every((id) => expanded.has(id)),
    expandAll: () => setExpanded(new Set(folderIds)),
    collapseAll: () => setExpanded(new Set()),
    focusedId,
    setFocusedId,
    activate,
    onRowKeyDown,
  }
}
