import type { TreeFile } from '@scout/shared'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { FileTypeOption } from './FileTypeFilter'
import { fileTypeOptions, filterByTypes } from './fileTypeOptions'
import { useFileCategories, type Category, type FileCategories } from './useFileCategories'
import { TYPES_PARAM, useFileTypeFilter, type FileTypeFilterState } from './useFileTypeFilter'

export type FileFilter = 'all' | Category

export const FILE_FILTERS: readonly { id: FileFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'Unreviewed' },
  { id: 'commented', label: 'Commented' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

/** `?show=` on the Files page: the verdict filter, shared by Swipe, Scroll, Grid and the file tree. */
export const SHOW_PARAM = 'show'

function parseFilter(value: string | null): FileFilter {
  return FILE_FILTERS.some((option) => option.id === value) ? (value as FileFilter) : 'all'
}

export interface FileFilterState {
  filter: FileFilter
  setFilter: (filter: FileFilter) => void
  types: FileTypeFilterState
  typeOptions: readonly FileTypeOption[]
  /** Per verdict bucket, over the files the type selection lets through. */
  counts: Record<FileFilter, number>
  /** The files both filters let through, in order; `keep` (the open file) stays listed even when it no longer matches. */
  visible: readonly TreeFile[]
  filtering: boolean
  clear: () => void
  categories: FileCategories
}

/** The Files page's verdict and file-type filters, both in the URL so every mode and the tree show the same files. */
export function useFileFilter(files: readonly TreeFile[], reviewFiles: readonly TreeFile[], keep: string | null): FileFilterState {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get(SHOW_PARAM))
  const types = useFileTypeFilter()
  const categories = useFileCategories(reviewFiles)
  const { categoryOf } = categories

  const typeOptions = useMemo(() => fileTypeOptions(files), [files])
  const typed = useMemo(() => filterByTypes(files, types.selected), [files, types.selected])
  const counts: Record<FileFilter, number> = { all: typed.length, none: 0, commented: 0, approved: 0, rejected: 0 }
  for (const file of typed) counts[categoryOf(file)] += 1
  const filtering = filter !== 'all' || types.selected.length > 0
  const visible = !filtering
    ? files
    : files.filter((file) => file.path === keep || (typed.includes(file) && (filter === 'all' || categoryOf(file) === filter)))

  const setFilter = useCallback(
    (next: FileFilter) =>
      setSearchParams(
        (params) => {
          const copy = new URLSearchParams(params)
          if (next === 'all') copy.delete(SHOW_PARAM)
          else copy.set(SHOW_PARAM, next)
          return copy
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  // One write: two back-to-back search-param updates would each start from the same old params.
  const clear = () =>
    setSearchParams(
      (params) => {
        const copy = new URLSearchParams(params)
        copy.delete(SHOW_PARAM)
        copy.delete(TYPES_PARAM)
        return copy
      },
      { replace: true },
    )

  return { filter, setFilter, types, typeOptions, counts, visible, filtering, clear, categories }
}
