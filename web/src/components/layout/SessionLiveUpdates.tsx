import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { isTestRunDetail } from '@/lib/detail-kind'
import { pluralize } from '@/lib/format'
import { useSessionContext } from '@/lib/session-context'
import { changedFileCount } from '@/lib/tree-changes'
import { useStoreEvents } from '@/lib/useStoreEvents'
import { useReview } from '@/state/review-context'
import { useShellConfig } from './shell-config'

/** How long the "N files changed on disk" toast stays. */
const TREE_TOAST_DURATION_MS = 4000

/**
 * The session's one `/api/events` subscription. `tree.updated` refetches the detail unless its
 * fingerprint is the one already shown; the cards then update in place (a changed file refetches
 * its patch and loses a stale verdict) and a small toast says how many files moved.
 * `session.updated` (artifacts, PR description) refetches the detail too. A test run has no tree: `testrun.updated`
 * (the run folder changed) refetches its detail instead, with no toast.
 * `review.updated` / `resolutions.updated` reload the review (not while it is being saved).
 */
export function SessionLiveUpdates() {
  const { sessionId, detail, reload: reloadDetail } = useSessionContext()
  const { saveStatus, reload: reloadReview } = useReview()
  const { kind } = useShellConfig()
  const tree = isTestRunDetail(detail) ? null : detail.tree
  const saveStatusRef = useRef(saveStatus)
  const treeRef = useRef(tree)
  const announcedRef = useRef(tree)

  useEffect(() => {
    saveStatusRef.current = saveStatus
    treeRef.current = tree
  })

  // Announce a tree that differs from the last one shown (first render excluded; test runs have no tree).
  useEffect(() => {
    const previous = announcedRef.current
    announcedRef.current = tree
    if (previous === null || tree === null || previous.fingerprint === tree.fingerprint) return
    const changed = changedFileCount(previous, tree)
    if (changed === 0) return
    toast.info(`${pluralize(changed, 'file')} changed on disk`, { duration: TREE_TOAST_DURATION_MS })
  }, [tree])

  useStoreEvents({
    'tree.updated': (event) => {
      if (event.sessionId !== sessionId) return
      if (kind === 'test-run' || event.fingerprint === treeRef.current?.fingerprint) return
      reloadDetail()
    },
    'testrun.updated': (event) => {
      if (kind === 'test-run' && event.sessionId === sessionId) reloadDetail()
    },
    'session.updated': (event) => {
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
