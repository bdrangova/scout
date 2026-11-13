import { effectiveVerdict, type FileReview, type TreeFile } from '@scout/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { indexByPath } from '@/lib/scope'
import { useReview } from '@/state/review-context'

/** How long the bar says what "Approve all" did, with its Undo. */
const APPROVED_NOTICE_MS = 4000

export interface ApproveAll {
  /** Set for a few seconds after an approval: how many files it approved. */
  done: { count: number } | null
  /** Approves every listed file that is not approved yet (rejected ones too); returns how many it approved. */
  approve: (paths: readonly string[]) => number
  /** Puts each file back as it was before the last `approve`. */
  undo: () => void
}

/**
 * "Approve all" of the Blueprint page: the Files page's own SET_VERDICT action per file (pinned to the file's fingerprint), no comment
 * and no toast per file. What each file had before is kept so Undo can restore it exactly (a file with no entry gets none back).
 */
export function useApproveAll(treeFiles: readonly TreeFile[]): ApproveAll {
  const { state, dispatch, fileReview } = useReview()
  const byPath = useMemo(() => indexByPath(treeFiles), [treeFiles])
  const reviewRef = useRef(state.review)
  useEffect(() => {
    reviewRef.current = state.review
  })
  const previous = useRef<ReadonlyMap<string, FileReview | null>>(new Map())
  const timer = useRef<number | null>(null)
  const [done, setDone] = useState<{ count: number } | null>(null)
  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => stopTimer, [stopTimer])

  const approve = useCallback(
    (paths: readonly string[]) => {
      const before = new Map<string, FileReview | null>()
      for (const path of paths) {
        const file = byPath.get(path)
        if (!file || effectiveVerdict(fileReview(path), file) === 'approved') continue
        before.set(path, fileReview(path))
        dispatch({ type: 'SET_VERDICT', path, verdict: 'approved', fingerprint: file.fingerprint })
      }
      if (before.size === 0) return 0
      previous.current = before
      stopTimer()
      setDone({ count: before.size })
      timer.current = window.setTimeout(() => setDone(null), APPROVED_NOTICE_MS)
      return before.size
    },
    [byPath, fileReview, dispatch, stopTimer],
  )

  const undo = useCallback(() => {
    stopTimer()
    setDone(null)
    const review = reviewRef.current
    const files = { ...review.files }
    for (const [path, entry] of previous.current) {
      if (entry) files[path] = entry
      else delete files[path]
    }
    previous.current = new Map()
    dispatch({ type: 'LOAD', review: { ...review, files } })
  }, [dispatch, stopTimer])

  return { done, approve, undo }
}
