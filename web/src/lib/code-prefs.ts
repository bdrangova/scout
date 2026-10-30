import { useSyncExternalStore } from 'react'

const CONTRAST_KEY = 'scout:code-contrast'

function read(): boolean {
  try {
    return window.localStorage.getItem(CONTRAST_KEY) === 'high'
  } catch {
    return false
  }
}

// High-contrast code is one switch for every diff on the page, so it is a tiny shared store.
let highContrast = read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Flips the high-contrast code mode (larger, bolder text and stronger syntax colours). Remembered across reloads. */
export function toggleCodeContrast(): void {
  highContrast = !highContrast
  try {
    window.localStorage.setItem(CONTRAST_KEY, highContrast ? 'high' : 'normal')
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener())
}

/** Whether diffs render in the high-contrast code mode; off by default. */
export function useCodeContrast(): boolean {
  return useSyncExternalStore(subscribe, () => highContrast)
}
