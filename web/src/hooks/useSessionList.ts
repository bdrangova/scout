import type { ArchivedSession, SessionListItem, SessionSummary } from '@review-dash/shared'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'
import { useArchivedSessions, useSessionList as useSessions } from '@/lib/hooks'
import { byLastActivity, countByFilter, matchesFilter, type StatusFilter } from '@/lib/session-status'
import { useHiddenIds } from '@/lib/useHiddenIds'
import { useStoreEvents } from '@/lib/useStoreEvents'

/** Store events are coalesced for this long before the list is refetched. */
export const LIST_REFRESH_DEBOUNCE_MS = 300

export interface SessionListView {
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  /** Flips the Archived view on and off (back to `all`). */
  toggleArchived: () => void
  /** Every live row (minus the ones archived from here), newest first, broken rows last. */
  items: readonly SessionListItem[]
  /** The live rows that match `filter`. */
  visible: readonly SessionListItem[]
  archived: readonly ArchivedSession[]
  counts: Record<StatusFilter, number>
  loading: boolean
  error: Error | null
  archivedError: Error | null
  reload: () => void
  reloadArchived: () => void
  archive: (session: SessionSummary) => Promise<void>
  unarchive: (session: ArchivedSession) => Promise<void>
  /** Hides an archived row at once (after a permanent delete). */
  hideArchived: (id: string) => void
}

/**
 * Everything the Sessions page shows: both fetches, the status filter, the rows hidden by an
 * archive/unarchive/delete made here, and the debounced refetch that follows any store event.
 */
export function useSessionList(): SessionListView {
  const live = useSessions()
  const archivedList = useArchivedSessions()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const timerRef = useRef<number | null>(null)
  // Rows archived (or unarchived) from here vanish at once; the refetch the move triggers resets both sets.
  const [hiddenLive, hideLive] = useHiddenIds(live.sessions)
  const [hiddenArchived, hideArchived] = useHiddenIds(archivedList.archived)

  const { reload } = live
  const reloadArchived = archivedList.reload
  const reloadBoth = () => {
    reload()
    reloadArchived()
  }

  // Any store change refetches once, 300 ms after the last event (no polling). Archiving moves a
  // folder out of (or back into) `sessions/`, so the same events cover the archived list.
  const scheduleReload = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      reloadBoth()
    }, LIST_REFRESH_DEBOUNCE_MS)
  }
  useStoreEvents({
    'session.added': scheduleReload,
    'session.updated': scheduleReload,
    'session.removed': scheduleReload,
    'review.updated': scheduleReload,
    'run.updated': scheduleReload,
    'tree.updated': scheduleReload,
    'resolutions.updated': scheduleReload,
  })
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  async function archive(session: SessionSummary) {
    try {
      await archiveSession(session.id)
      hideLive(session.id)
      reloadBoth()
    } catch (err) {
      toast.error(archiveErrorMessage(err))
    }
  }

  async function unarchive(session: ArchivedSession) {
    try {
      await unarchiveSession(session.id)
      hideArchived(session.id)
      reloadBoth()
    } catch (err) {
      toast.error("Couldn't unarchive the session", { description: archiveErrorMessage(err) })
    }
  }

  const items = [...(live.sessions ?? [])].filter((item) => !hiddenLive.has(item.id)).sort(byLastActivity)
  const archived = (archivedList.archived ?? []).filter((item) => !hiddenArchived.has(item.id))

  return {
    filter,
    setFilter,
    toggleArchived: () => setFilter(filter === 'archived' ? 'all' : 'archived'),
    items,
    visible: items.filter((item) => matchesFilter(item, filter)),
    archived,
    counts: countByFilter(items, archived.length),
    loading: live.loading,
    error: live.error,
    archivedError: archivedList.error,
    reload,
    reloadArchived,
    archive,
    unarchive,
    hideArchived,
  }
}
