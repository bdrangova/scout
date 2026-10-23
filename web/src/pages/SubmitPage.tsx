import { usePrReview } from '@/components/prreview/pr-review-context'
import { PrReviewSubmitPage } from './PrReviewSubmitPage'
import { PrDescriptionPanel } from '@/components/submit/PrDescriptionPanel'
import { SubmitView } from '@/components/submit/SubmitView'

/** The code review's Submit page: the shared Submit screen with the PR description card. */
export function SubmitPage() {
  const prReview = usePrReview()
  if (prReview) return <PrReviewSubmitPage />
  return <SubmitView descriptionPanel={<PrDescriptionPanel />} />
}
