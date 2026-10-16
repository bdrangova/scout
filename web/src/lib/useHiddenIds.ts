import { useCallback, useState } from 'react'

const NONE: ReadonlySet<string> = new Set()

/**
 * Ids hidden from a fetched list until that list is replaced: a row archived from the list
 * disappears at once, and the next refetch (which no longer has it) resets the set, so a session
 * that later comes back is never hidden by a stale entry.
 */
export function useHiddenIds<T>(list: readonly T[] | null): [ReadonlySet<string>, (id: string) => void] {
  const [hidden, setHidden] = useState<{ list: readonly T[] | null; ids: ReadonlySet<string> }>({ list, ids: NONE })
  const hide = useCallback(
    (id: string) => setHidden((prev) => ({ list, ids: new Set([...(prev.list === list ? prev.ids : NONE), id]) })),
    [list],
  )
  return [hidden.list === list ? hidden.ids : NONE, hide]
}
