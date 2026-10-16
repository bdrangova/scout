import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { pluralize } from '@/lib/format'
import { useSessionContext } from '@/lib/session-context'
import { changedFileCount } from '@/lib/tree-changes'
import { useStoreEvents } from '@/lib/useStoreEvents'
import { useReview } from '@/state/review-context'

/** How long the "N files changed on disk" toast stays. */
const TREE_TOAST_DURATION_MS = 4000

/**
 * The session's one `/api/events` subscription. `tree.updated` refetches the detail unless its
 * fingerprint is the one already shown; the cards then update in place (a changed file refetches
 * its patch and loses a stale verdict) and a small toast says how many files moved.
 * `session.updated` (artifacts, PR description) and `run.updated` refetch the detail too.
 * `review.updated` / `resolutions.updated` reload the review (not while it is being saved).
 */
export function SessionLiveUpdates() {
  const { sessionId, detail, reload: reloadDetail } = useSessionContext()
  const { saveStatus, reload: reloadReview } = useReview()
  const saveStatusRef = useRef(saveStatus)
  const treeRef = useRef(detail.tree)
  const announcedRef = useRef(detail.tree)

  useEffect(() => {
    saveStatusRef.current = saveStatus
    treeRef.current = detail.tree
  })

  // Announce a tree that differs from the last one shown (first render excluded).
  useEffect(() => {
    const previous = announcedRef.current
    announcedRef.current = detail.tree
    if (previous.fingerprint === detail.tree.fingerprint) return
    const changed = changedFileCount(previous, detail.tree)
    if (changed === 0) return
    toast.info(`${pluralize(changed, 'file')} changed on disk`, { duration: TREE_TOAST_DURATION_MS })
  }, [detail.tree])

  useStoreEvents({
    'tree.updated': (event) => {
      if (event.sessionId !== sessionId) return
      if (event.fingerprint === treeRef.current.fingerprint) return
      reloadDetail()
    },
    'session.updated': (event) => {
      if (event.sessionId === sessionId) reloadDetail()
    },
    'run.updated': (event) => {
      if (event.sessionId === sessionId) reloadDetail()
    },
    'review.updated': (event) => {
      if (event.sessionId === sessionId && saveStatusRef.current !== 'saving') reloadReview()
    },
    'resolutions.updated': (event) => {
      if (event.sessionId === sessionId) reloadReview()
    },
  })

  return null
}
