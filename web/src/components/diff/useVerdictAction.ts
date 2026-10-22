import type { FileReview } from '@review-dash/shared'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { splitPath } from '@/lib/paths'
import { useReview } from '@/state/review-context'

/** One id for every verdict toast: a new verdict replaces the last one instead of stacking a second. */
const TOAST_ID = 'verdict-undo'
const TOAST_MS = 6000

/** Puts the file back as it was before the latest verdict; null once undone or after a reset. */
let pendingUndo: (() => void) | null = null

/** Undo the latest verdict (the toast's button, `Z`, ⌘/Ctrl+Z). Returns false when there is nothing to undo. */
export function undoLastVerdict(): boolean {
  const undo = pendingUndo
  if (undo === null) return false
  pendingUndo = null
  toast.dismiss(TOAST_ID)
  undo()
  return true
}

/** Show a verdict toast with an Undo button and make `undo` what `Z` / ⌘Z run (a later verdict replaces both). */
export function announceVerdict(message: string, undo: () => void): void {
  pendingUndo = undo
  toast(message, {
    id: TOAST_ID,
    duration: TOAST_MS,
    action: { label: 'Undo', onClick: undoLastVerdict },
  })
}

/** Forget the pending undo and close its toast (the files page unmounting). */
export function clearVerdictUndo(): void {
  pendingUndo = null
  toast.dismiss(TOAST_ID)
}

/**
 * `useReview().setVerdict` plus a toast, "Approved ci.yml · Undo", for the key, the button, a swipe
 * and a grid tile alike. Undo restores the file's previous review entry and goes back to the file.
 * The toast names the item by `label` (default: the path's file name). A reject that still waits for its comment stores nothing, so it has nothing to announce or undo.
 * Returns what `setVerdict` does: true when a comment went with the verdict.
 */
export function useVerdictAction(): (path: string, verdict: 'approved' | 'rejected', fingerprint: string | null, label?: string) => boolean {
  const { state, dispatch, setVerdict } = useReview()
  const reviewRef = useRef(state.review)
  useEffect(() => {
    reviewRef.current = state.review
  })

  return useCallback(
    (path, verdict, fingerprint, label = splitPath(path).name) => {
      const before: FileReview | undefined = reviewRef.current.files[path]
      const withComment = setVerdict(path, verdict, fingerprint)
      if (verdict === 'rejected' && !withComment) return withComment
      announceVerdict(`${verdict === 'approved' ? 'Approved' : 'Rejected'} ${label}`, () => {
        const review = reviewRef.current
        const { [path]: _current, ...others } = review.files
        dispatch({ type: 'LOAD', review: { ...review, files: before ? { ...others, [path]: before } : others } })
        dispatch({ type: 'GO_TO', path })
      })
      return withComment
    },
    [setVerdict, dispatch],
  )
}
