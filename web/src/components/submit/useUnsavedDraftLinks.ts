import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { draftLinks, type DraftLink } from './unsaved-drafts'

/** The links to composers with text typed and not added; empty when there is none. */
export function useUnsavedDraftLinks(): DraftLink[] {
  const { detail } = useSessionContext()
  const { unsavedDrafts } = useReview()
  return draftLinks(unsavedDrafts, detail)
}
