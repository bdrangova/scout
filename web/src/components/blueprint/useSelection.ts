import { useCallback, useState } from 'react'

/** How many of a box's files are picked. */
export type PickState = 'all' | 'some' | 'none'

export function pickStateOf(files: readonly string[], selected: ReadonlySet<string>): PickState {
  const picked = files.filter((path) => selected.has(path)).length
  if (picked === 0) return 'none'
  return picked === files.length ? 'all' : 'some'
}

export interface Selection {
  /** Select mode is on. */
  active: boolean
  /** The picked file paths: kept across diagrams while select mode lasts, cleared when it ends. */
  selected: ReadonlySet<string>
  /** Turns select mode on, optionally with these files already picked. */
  enter: (files?: readonly string[]) => void
  /** Turns select mode off and forgets the picks. */
  leave: () => void
  /** Picks the files, or unpicks them when they are all picked already. */
  toggle: (files: readonly string[]) => void
  add: (files: readonly string[]) => void
  clear: () => void
}

interface State {
  active: boolean
  selected: ReadonlySet<string>
}

const OFF: State = { active: false, selected: new Set() }

/** Select mode and the picked files of the Blueprint page; they live above the diagram so they survive moving between diagrams. */
export function useSelection(): Selection {
  const [state, setState] = useState<State>(OFF)
  const enter = useCallback((files: readonly string[] = []) => setState((current) => ({ active: true, selected: new Set([...current.selected, ...files]) })), [])
  const leave = useCallback(() => setState(OFF), [])
  const toggle = useCallback((files: readonly string[]) => {
    if (files.length === 0) return
    setState((current) => {
      const selected = new Set(current.selected)
      if (files.every((path) => selected.has(path))) for (const path of files) selected.delete(path)
      else for (const path of files) selected.add(path)
      return { ...current, selected }
    })
  }, [])
  const add = useCallback((files: readonly string[]) => setState((current) => ({ ...current, selected: new Set([...current.selected, ...files]) })), [])
  const clear = useCallback(() => setState((current) => ({ ...current, selected: new Set() })), [])
  return { active: state.active, selected: state.selected, enter, leave, toggle, add, clear }
}
