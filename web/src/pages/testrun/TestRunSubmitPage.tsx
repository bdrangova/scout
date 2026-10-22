import { SubmitView } from "@/components/submit/SubmitView";
import { RunSummaryPanel } from "@/components/submit/RunSummaryPanel";
import { TEST_RUN_DECISION_CHOICES } from "@/components/submit/decision-choices";
import { useTestRunDetail } from "@/lib/detail-kind";

/** The test run's Submit page: the code review's Submit screen without the PR coupling (run summary instead of the PR description, Accept / Changes requested). */
export function TestRunSubmitPage() {
  const detail = useTestRunDetail();
  return (
    <SubmitView
      descriptionPanel={<RunSummaryPanel detail={detail} />}
      decisionChoices={TEST_RUN_DECISION_CHOICES}
    />
  );
}
