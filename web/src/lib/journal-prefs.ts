import { useCallback, useState, useSyncExternalStore } from 'react'

const INLINE_KEY = 'review-dash:journal-inline'
const STRIP_KEY = (sessionId: string) => `review-dash:journal-strip:${sessionId}`

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

// Inline notes are one switch for every card on the page, so it is a tiny shared store.
let inlineHidden = read(INLINE_KEY) === 'hidden'
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Flips whether the diff shows Scout's notes (`N`); returns the new "visible". Remembered across reloads. */
export function toggleJournalInline(): boolean {
  inlineHidden = !inlineHidden
  write(INLINE_KEY, inlineHidden ? 'hidden' : 'shown')
  listeners.forEach((listener) => listener())
  return !inlineHidden
}

/** Whether the diff shows Scout's notes under their lines; on by default. */
export function useJournalInlineVisible(): boolean {
  return !useSyncExternalStore(subscribe, () => inlineHidden)
}

/** The "Scout's notes" strip's collapsed state, remembered per session (expanded by default). */
export function useJournalStripCollapsed(sessionId: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => read(STRIP_KEY(sessionId)) === 'collapsed')
  const toggle = useCallback(() => {
    const next = !collapsed
    write(STRIP_KEY(sessionId), next ? 'collapsed' : 'expanded')
    setCollapsed(next)
  }, [collapsed, sessionId])
  return [collapsed, toggle]
}
