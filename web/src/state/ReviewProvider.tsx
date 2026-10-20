import {
  initialReviewState,
  mergeComments,
  progress,
  reviewReducer,
  type CommentTarget,
  type ReviewAction,
  type ReviewContext as ReducerContext,
  type ReviewResponse,
  type ReviewState,
  type WorkingTree,
} from '@review-dash/shared'
import { useCallback, useMemo, useReducer, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { unsavedDraftsOf } from '@/lib/comment-drafts'
import { useAsync } from '@/lib/hooks'
import { useSessionContext } from '@/lib/session-context'
import { ReviewStateContext, sameTarget, type ReviewContextValue, type ReviewInput } from './review-context'
import { useAutosave } from './useAutosave'

function stamp(action: ReviewInput, now: string): ReviewAction {
  switch (action.type) {
    case 'CANCEL_REJECT':
    case 'LOAD':
      return action
    default:
      return { ...action, now }
  }
}

/**
 * Loads the session's review (the server answers with an in-memory empty review when none is on
 * disk) and then owns the reducer state, the merged comments and the autosave.
 */
export function ReviewProvider({ children }: { children: ReactNode }) {
  const { sessionId, detail } = useSessionContext()
  const { data, error, reload } = useAsync(`review:${sessionId}`, () =>
    apiGet<ReviewResponse>(`/sessions/${encodeURIComponent(sessionId)}/review`),
  )

  if (error) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24">
        <h1 className="m-0 text-lg font-bold text-ink">Couldn't load the review</h1>
        <p className="m-0 text-sm text-ink-muted">{error.message}</p>
        <Button onClick={reload}>Retry</Button>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="px-6 py-24 text-center text-sm text-ink-muted" aria-busy="true">
        Loading review…
      </main>
    )
  }

  return (
    <LoadedReviewProvider
      key={`${sessionId}:${data.review.updatedAt}`}
      sessionId={sessionId}
      tree={detail.tree}
      response={data}
      reload={reload}
    >
      {children}
    </LoadedReviewProvider>
  )
}

interface LoadedProps {
  sessionId: string
  /** The live tree; a refetch after `tree.updated` swaps it without remounting the provider. */
  tree: WorkingTree
  response: ReviewResponse
  reload: () => void
  children: ReactNode
}

function LoadedReviewProvider({ sessionId, tree, response, reload, children }: LoadedProps) {
  const ctx = useMemo<ReducerContext>(() => ({ files: tree.files }), [tree.files])
  const reducer = useCallback(
    (state: ReviewState, action: ReviewAction) => reviewReducer(state, action, ctx),
    [ctx],
  )
  const [state, rawDispatch] = useReducer(reducer, response.review, initialReviewState)
  const dispatch = useCallback((action: ReviewInput) => rawDispatch(stamp(action, new Date().toISOString())), [])

  const resolutions = response.resolutions
  const comments = useMemo(() => mergeComments(state.review, resolutions), [state.review, resolutions])
  const commentsFor = useCallback(
    (target: CommentTarget) => comments.filter((comment) => sameTarget(comment.target, target)),
    [comments],
  )
  const files = state.review.files
  const fileReview = useCallback((path: string) => files[path] ?? null, [files])
  const reviewed = useMemo(() => progress(state.review, tree, resolutions), [state.review, tree, resolutions])

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const draftFor = useCallback((path: string) => drafts[path] ?? '', [drafts])
  const setDraft = useCallback((path: string, text: string) => {
    setDrafts((current) => {
      if (text === '') {
        const { [path]: _gone, ...rest } = current
        return rest
      }
      return { ...current, [path]: text }
    })
  }, [])
  const unsavedDrafts = useMemo(() => unsavedDraftsOf(drafts), [drafts])
  const setVerdict = useCallback(
    (path: string, verdict: 'approved' | 'rejected', fingerprint: string | null) => {
      const comment = (drafts[path] ?? '').trim()
      dispatch({ type: 'SET_VERDICT', path, verdict, fingerprint, comment: comment === '' ? undefined : comment })
      if (comment !== '') setDraft(path, '')
      return comment !== ''
    },
    [drafts, dispatch, setDraft],
  )

  const autosave = useAutosave({
    sessionId,
    review: state.review,
    initialBase: response.review.updatedAt,
    dispatch: rawDispatch,
  })
  const saveStatus = autosave.status
  const flushAutosave = autosave.flush
  const flushSave = useCallback(async () => {
    // A field still focused (a send by keyboard) commits on blur; let that render and its effects settle.
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
      active.blur()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return flushAutosave()
  }, [flushAutosave])

  const value = useMemo<ReviewContextValue>(
    () => ({
      state,
      dispatch,
      comments,
      commentsFor,
      fileReview,
      draftFor,
      setDraft,
      unsavedDrafts,
      setVerdict,
      progress: reviewed,
      resolutions,
      saveStatus,
      flushSave,
      reload,
    }),
    [state, dispatch, comments, commentsFor, fileReview, draftFor, setDraft, unsavedDrafts, setVerdict, reviewed, resolutions, saveStatus, flushSave, reload],
  )

  return <ReviewStateContext.Provider value={value}>{children}</ReviewStateContext.Provider>
}
