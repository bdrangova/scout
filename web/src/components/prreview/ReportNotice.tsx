import { currentProposal } from '@scout/shared'
import { Notice } from '@/components/ui/notice'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'

/** Only when the report needs attention: not there yet, or out of step with the diff. The summary lives in the rail. */
export function ReportNotice() {
  const { detail, report, current } = useCurrentPrReport()
  if (!detail) return null
  if (!report) return <Notice tone="info" className="m-3">Waiting for a review report.</Notice>
  if (!current) return <Notice tone="warn" className="m-3">Report differs from the diff. Refresh it; stale approvals are excluded.</Notice>
  return null
}

/** The rail's PR line: link, proposed-comment counts, and who produced the report (on hover). */
export function PrReportSummary() {
  const { detail, report, current } = useCurrentPrReport()
  const { state } = useReview()
  if (!detail || !report) return null
  const counts = { approved: 0, rejected: 0, none: 0 }
  report.findings.forEach((f) => { counts[current ? currentProposal(report, f, state.review).verdict : 'none'] += 1 })
  const provenance = `Reviewed by ${report.reviewers.map((r) => `${r.name} (${r.version})`).join(' → ')} at ${report.headSha.slice(0, 12)}`
  return <p className="m-0 mt-2 text-xs text-ink-muted" title={provenance}>
    <a className="font-semibold text-ink underline underline-offset-2" href={report.pr.url} target="_blank" rel="noreferrer">PR #{report.pr.number}</a>
    {' · '}{report.findings.length} proposed · {counts.approved} approved · {counts.rejected} rejected · {counts.none} pending
  </p>
}
