import {
  initialReviewState,
  mergeComments,
  progress,
  reviewReducer,
  type CommentTarget,
  type ReviewAction,
  type ReviewContext as ReducerContext,
  type ReviewItem,
  type ReviewResponse,
  type ReviewState,
  type SessionDetail,
} from '@review-dash/shared'
import { useCallback, useMemo, useReducer, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { draftKey, unsavedDraftsOf } from '@/lib/comment-drafts'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useAsync } from '@/lib/hooks'
import { useSessionContext } from '@/lib/session-context'
import { ReviewStateContext, sameTarget, type ItemKind, type ReviewContextValue, type ReviewInput } from './review-context'
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
/** Verdict items of a session: the tree's files, or a test run's scenarios keyed by id (fingerprints from the server). */
function itemsOfDetail(detail: SessionDetail): { items: readonly ReviewItem[]; itemKind: ItemKind } {
  if (isTestRunDetail(detail)) {
    // Index order, so the reducer's advance walks the scenarios the way the Review page lists them.
    const ordered = [...detail.scenarios].sort((a, b) => a.order - b.order)
    return { items: ordered.map((scenario) => ({ path: scenario.id, fingerprint: scenario.fingerprint })), itemKind: 'scenario' }
  }
  return { items: detail.tree.files, itemKind: 'file' }
}

/**
 * Loads the session's review (the server answers with an in-memory empty review when none is on
 * disk) and then owns the reducer state, the merged comments and the autosave. The items are the
 * tree's files (code review) or the scenarios (test run, see `itemsOfDetail`).
 */
export function ReviewProvider({ children }: { children: ReactNode }) {
  const { sessionId, detail } = useSessionContext()
  const { items, itemKind } = useMemo(() => itemsOfDetail(detail), [detail])
  const { data, error, reload } = useAsync(`review:${sessionId}`, () =>
    apiGet<ReviewResponse>(`/sessions/${encodeURIComponent(sessionId)}/review`),
  )

  if (error) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24">
        <h1 className="m-0 text-lg font-bold text-ink">Couldn't load review</h1>
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
      items={items}
      itemKind={itemKind}
      response={data}
      reload={reload}
    >
      {children}
    </LoadedReviewProvider>
  )
}

interface LoadedProps {
  sessionId: string
  /** The live items; a refetch after `tree.updated` / `testrun.updated` swaps them without remounting the provider. */
  items: readonly ReviewItem[]
  itemKind: ItemKind
  response: ReviewResponse
  reload: () => void
  children: ReactNode
}

export function LoadedReviewProvider({ sessionId, items, itemKind, response, reload, children }: LoadedProps) {
  const ctx = useMemo<ReducerContext>(() => ({ files: items, itemKind }), [items, itemKind])
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
  const reviewed = useMemo(() => progress(state.review, items, resolutions), [state.review, items, resolutions])

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const draftFor = useCallback((key: string) => drafts[key] ?? '', [drafts])
  const setDraft = useCallback((key: string, text: string) => {
    setDrafts((current) => {
      if (text === '') {
        const { [key]: _gone, ...rest } = current
        return rest
      }
      return { ...current, [key]: text }
    })
  }, [])
  const unsavedDrafts = useMemo(() => unsavedDraftsOf(drafts), [drafts])
  const setVerdict = useCallback(
    (path: string, verdict: 'approved' | 'rejected', fingerprint: string | null) => {
      const key = draftKey({ kind: itemKind, ref: path })
      const comment = (drafts[key] ?? '').trim()
      dispatch({ type: 'SET_VERDICT', path, verdict, fingerprint, comment: comment === '' ? undefined : comment })
      if (comment !== '') setDraft(key, '')
      return comment !== ''
    },
    [drafts, dispatch, setDraft, itemKind],
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
      items,
      itemKind,
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
    [state, items, itemKind, dispatch, comments, commentsFor, fileReview, draftFor, setDraft, unsavedDrafts, setVerdict, reviewed, resolutions, saveStatus, flushSave, reload],
  )

  return <ReviewStateContext.Provider value={value}>{children}</ReviewStateContext.Provider>
}
