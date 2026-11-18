import { useEffect, useRef } from 'react'
import { useReview } from '@/state/review-context'

/**
 * URL ↔ `review.ui.currentFile`: when the URL moves (a link, the back button, the first render)
 * the review follows; when only the review moves (advance, a hotkey) `followState` moves the URL.
 * Decided from the values of the previous commit, so StrictMode's double-invoked mount stays idempotent.
 */
export function useFileUrlSync(urlPath: string | null, statePath: string | null, followState: (path: string) => void): void {
  const { dispatch } = useReview()
  const previousRef = useRef<{ url: string | null; state: string | null } | null>(null)
  const followRef = useRef(followState)
  useEffect(() => {
    followRef.current = followState
  })
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = { url: urlPath, state: statePath }
    if (urlPath === null || urlPath === statePath) return
    const urlMoved = previous === null || previous.url !== urlPath
    const stateMoved = previous !== null && previous.state !== statePath
    if (stateMoved && !urlMoved && statePath !== null) followRef.current(statePath)
    else dispatch({ type: 'GO_TO', path: urlPath })
  }, [urlPath, statePath, dispatch])
}
