import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { FILE_TYPES, type FileTypeId } from '@/lib/file-type'

/** The grid's file-type selection lives in the URL (`?types=ts,react`) so it survives mode switches and reloads. */
export const TYPES_PARAM = 'types'

const KNOWN = new Set<string>(FILE_TYPES.map((type) => type.id))

/** The valid type ids in a `types` parameter, in `FILE_TYPES` order; unknown ids are dropped. */
export function parseTypes(value: string | null): FileTypeId[] {
  if (value === null || value === '') return []
  const wanted = new Set(value.split(',').filter((id) => KNOWN.has(id)))
  return FILE_TYPES.map((type) => type.id).filter((id) => wanted.has(id))
}

export interface FileTypeFilterState {
  selected: readonly FileTypeId[]
  toggle: (id: FileTypeId, on: boolean) => void
  clear: () => void
}

export function useFileTypeFilter(): FileTypeFilterState {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(TYPES_PARAM)
  const selected = useMemo(() => parseTypes(raw), [raw])

  const write = useCallback(
    (next: readonly FileTypeId[]) => {
      setSearchParams(
        (params) => {
          const copy = new URLSearchParams(params)
          if (next.length === 0) copy.delete(TYPES_PARAM)
          else copy.set(TYPES_PARAM, next.join(','))
          return copy
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const toggle = useCallback(
    (id: FileTypeId, on: boolean) => {
      const set = new Set(selected)
      if (on) set.add(id)
      else set.delete(id)
      write(FILE_TYPES.map((type) => type.id).filter((typeId) => set.has(typeId)))
    },
    [selected, write],
  )

  const clear = useCallback(() => write([]), [write])

  return { selected, toggle, clear }
}
