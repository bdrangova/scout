import { useMemo } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'
import { summaryCards } from '@/components/prsummary/summary-cards'
import { SummaryCards, SummaryGrid, SummaryRailSection } from '@/components/prsummary/SummaryViews'
import { usePageMode } from '@/components/spec/usePageMode'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'

/**
 * `/s/:id/summary` of a PR review, where it opens: the summary card (plain bullets, change tags, the PR's
 * facts), the PR description, the Jira tickets and other spec sources, and the changed files. Scroll or grid.
 */
export function PrSummaryPage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const { report } = useCurrentPrReport()
  const { mode, openInScroll } = usePageMode()
  const cards = useMemo(() => summaryCards(report, detail.spec), [report, detail.spec])

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
      <PageHeader title="Summary" summary={report ? <>{report.pr.repository} #{report.pr.number}</> : null} />
      <SummaryRailSection key={mode} cards={cards} />
      {mode === 'grid' ? (
        <SummaryGrid cards={cards} report={report} detail={detail} onOpen={openInScroll} />
      ) : (
        <SummaryCards cards={cards} report={report} detail={detail} sessionId={sessionId} />
      )}
    </main>
  )
}
