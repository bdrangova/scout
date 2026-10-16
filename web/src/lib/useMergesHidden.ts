import { useCallback, useState } from 'react'

const STORAGE_KEY = 'review-dash:hide-merges'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'hidden'
  } catch {
    return false
  }
}

function store(hidden: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? 'hidden' : 'shown')
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

/** Whether the commit strip hides merge commits (`H`); shown by default, remembered across reloads. */
export function useMergesHidden(): [boolean, () => boolean] {
  const [hidden, setHidden] = useState(readStored)
  const toggle = useCallback(() => {
    const next = !hidden
    store(next)
    setHidden(next)
    return next
  }, [hidden])
  return [hidden, toggle]
}
