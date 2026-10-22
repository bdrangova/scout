import { PrDescriptionPanel } from '@/components/submit/PrDescriptionPanel'
import { SubmitView } from '@/components/submit/SubmitView'

/** The code review's Submit page: the shared Submit screen with the PR description card. */
export function SubmitPage() {
  return <SubmitView descriptionPanel={<PrDescriptionPanel />} />
}
