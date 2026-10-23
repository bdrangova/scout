import { currentProposal } from '@review-dash/shared'
import { Notice } from '@/components/ui/notice'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'
export function ReportNotice() {
  const { detail, report, current } = useCurrentPrReport()
  const { state } = useReview()
  if (!detail) return null
  if (!report) return <Notice tone="info" className="m-3">Waiting for a review report.</Notice>
  const counts = { approved: 0, rejected: 0, none: 0 }
  report.findings.forEach((f) => { counts[current ? currentProposal(report, f, state.review).verdict : 'none'] += 1 })
  return <div className="flex shrink-0 flex-col gap-2 border-b-fine border-line bg-paper-2 px-4 py-2 text-xs">
    <span><a className="font-semibold underline underline-offset-2" href={report.pr.url} target="_blank" rel="noreferrer">PR #{report.pr.number}</a> · {report.findings.length} proposed comments · {counts.approved} approved · {counts.rejected} rejected · {counts.none} pending</span>
    <details><summary className="cursor-pointer text-ink-muted">Review provenance</summary><p className="my-1">{report.reviewers.map((r) => `${r.name} (${r.version})`).join(' → ')} · {report.headSha.slice(0, 12)}</p></details>
    {!current && <Notice tone="warn">Report differs from the diff. Refresh it; stale approvals are excluded.</Notice>}
  </div>
}
