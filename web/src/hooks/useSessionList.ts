import type { ArchivedSession, SessionListItem } from '@scout/shared'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'
import { useArchivedSessions, useSessionList as useSessions } from '@/lib/hooks'
import type { SessionKind } from '@/lib/paths'
import { byLastActivity, countByFilter, matchesFilter, type LiveSummary, type StatusFilter } from '@/lib/session-status'
import { useHiddenIds } from '@/lib/useHiddenIds'
import { useStoreEvents } from '@/lib/useStoreEvents'

/** Store events are coalesced for this long before the list is refetched. */
export const LIST_REFRESH_DEBOUNCE_MS = 300

export interface SessionListView {
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  /** Flips the Archived view on and off, preserving the live review filter. */
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
  archive: (session: LiveSummary) => Promise<void>
  unarchive: (session: ArchivedSession) => Promise<void>
  /** Hides an archived row at once (after a permanent delete). */
  hideArchived: (id: string) => void
}

/**
 * Everything the Sessions page shows for one kind (code reviews or test runs): both fetches, the status filter, the rows hidden by an
 * archive/unarchive/delete made here, and the debounced refetch that follows any store event.
 */
export function useSessionList(kind: SessionKind = 'code-review'): SessionListView {
  const live = useSessions(kind)
  const archivedList = useArchivedSessions(kind)
  const [liveFilter, setLiveFilter] = useState<StatusFilter>('all')
  const [archivedView, setArchivedView] = useState(false)
  const filter: StatusFilter = archivedView ? 'archived' : liveFilter
  const setFilter = (next: StatusFilter) => {
    setArchivedView(next === 'archived')
    if (next !== 'archived') setLiveFilter(next)
  }
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
    'tree.updated': scheduleReload,
    'resolutions.updated': scheduleReload,
    'testrun.updated': scheduleReload,
  })
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  async function archive(session: LiveSummary) {
    try {
      await archiveSession(session.id)
      hideLive(session.id)
      reloadBoth()
      toast.success('Session archived', {
        description: session.title,
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            void unarchiveSession(session.id).then(reloadBoth, (reason: unknown) => toast.error("Couldn't restore the session", { description: archiveErrorMessage(reason) }))
          },
        },
      })
    } catch (err) {
      toast.error(archiveErrorMessage(err))
    }
  }

  async function unarchive(session: ArchivedSession) {
    try {
      await unarchiveSession(session.id)
      hideArchived(session.id)
      reloadBoth()
      toast.success('Session restored', { description: session.title })
    } catch (err) {
      toast.error("Couldn't restore the session", { description: archiveErrorMessage(err) })
    }
  }

  const items = [...(live.sessions ?? [])].filter((item) => !hiddenLive.has(item.id)).sort(byLastActivity)
  const archived = (archivedList.archived ?? []).filter((item) => !hiddenArchived.has(item.id))

  return {
    filter,
    setFilter,
    toggleArchived: () => setArchivedView((value) => !value),
    items,
    visible: items.filter((item) => matchesFilter(item, filter)),
    archived,
    counts: countByFilter(items, archived.length),
    loading: archivedView ? archivedList.loading : live.loading,
    error: archivedView ? null : live.error,
    archivedError: archivedList.error,
    reload,
    reloadArchived,
    archive,
    unarchive,
    hideArchived,
  }
}
