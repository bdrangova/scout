import { Navigate } from 'react-router'
import { landingSection } from '@/lib/landing-section'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

/**
 * The index route of a session: replaces itself with the step the review should open on. Rendered
 * inside `ReviewProvider`, which has already loaded the review, so there is no flash of another page.
 */
export function SessionIndexRedirect() {
  const { detail } = useSessionContext()
  const { state, resolutions } = useReview()
  return <Navigate to={landingSection(detail, state.review, resolutions)} replace />
}
