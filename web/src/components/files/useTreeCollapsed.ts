import { useCallback, useState } from 'react'

const STORAGE_KEY = 'scout:files-tree-collapsed'

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Whether the rail's Files block is folded down to its header; remembered like the rail density. `[collapsed, toggle]`. */
export function useTreeCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(!current))
      } catch {
        // Storage unavailable: the choice lasts for this page only.
      }
      return !current
    })
  }, [])
  return [collapsed, toggle]
}
