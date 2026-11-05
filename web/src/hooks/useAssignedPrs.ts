import { AssignedPrsResponseSchema, type AssignedPrsResponse } from '@scout/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAssignedPrs } from '@/lib/github'
import { useStoreEvents } from '@/lib/useStoreEvents'
import { useRefetchOnFocus } from './useRefetchOnFocus'

export interface AssignedPrsState {
  data: AssignedPrsResponse | null
  error: Error | null
  /** A request is in flight (the first load, a focus refetch or a manual refresh). */
  busy: boolean
  /** Refetches without Scout's short server cache (`?refresh=1`). */
  refresh: () => void
  /** Refetches from the cache. */
  reload: () => void
}

/** How often the list is refetched in the background while the page is visible; matches the server's cache. */
export const ASSIGNED_POLL_MS = 60_000
const STORAGE_KEY = 'scout.assigned-prs'

// The last answer, kept for the next visit (in memory, and in the tab's storage across reloads) so the page shows at once.
let cached: AssignedPrsResponse | null = null

function readCache(): AssignedPrsResponse | null {
  if (cached !== null) return cached
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw === null ? null : AssignedPrsResponseSchema.safeParse(JSON.parse(raw))
    cached = parsed?.success ? parsed.data : null
  } catch {
    cached = null
  }
  return cached
}

function writeCache(next: AssignedPrsResponse): void {
  cached = next
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the in-memory copy still serves this tab.
  }
}

/** Test hook: forget the cached list. */
export function clearAssignedPrsCache(): void {
  cached = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored.
  }
}

/**
 * `GET /api/github/assigned` (nothing while `enabled` is false): shown from the last answer at once, then loaded on mount, every minute while the page is visible, whenever the window regains focus, and when a session or placeholder is
 * added, archived (a session marked Done marks its PR Done) or removed; stale data stays while a refetch runs. */
export function useAssignedPrs(enabled = true): AssignedPrsState {
  const [data, setData] = useState<AssignedPrsResponse | null>(() => (enabled ? readCache() : null))
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(true)
  // Only the newest request may settle the state.
  const latest = useRef(0)

  const start = useCallback((refresh: boolean) => {
    latest.current += 1
    const mine = latest.current
    fetchAssignedPrs(refresh).then(
      (next) => {
        if (latest.current !== mine) return
        writeCache(next)
        setData(next)
        setError(null)
        setBusy(false)
      },
      (reason: unknown) => {
        if (latest.current !== mine) return
        setError(reason instanceof Error ? reason : new Error(String(reason)))
        setBusy(false)
      },
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    start(false)
    return () => {
      latest.current += 1
    }
  }, [start, enabled])

  const reload = useCallback(() => {
    if (!enabled) return
    setBusy(true)
    start(false)
  }, [start, enabled])
  const refresh = useCallback(() => {
    setBusy(true)
    start(true)
  }, [start])
  useRefetchOnFocus(reload)
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') start(false)
    }, ASSIGNED_POLL_MS)
    return () => window.clearInterval(timer)
  }, [start, enabled])
  useStoreEvents({ 'session.added': reload, 'session.removed': reload, 'pr-pending.updated': reload }, enabled)
  return { data, error, busy, refresh, reload }
}
