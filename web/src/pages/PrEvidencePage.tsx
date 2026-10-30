import { SearchCheck } from 'lucide-react'
import { useCallback } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { FindingDeck } from '@/components/prreview/FindingDeck'
import { FindingGrid } from '@/components/prreview/FindingGrid'
import { FindingsRailSection } from '@/components/prreview/FindingsRailSection'
import { useFindingCommentCounts } from '@/components/prreview/finding-comments'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'
import { useProposal } from '@/components/prreview/useProposal'
import { pluralize } from '@/lib/format'
import { MODE_PARAM, modeSearch, parseRunMode } from '@/lib/mode'
import { evidenceRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { useHotkeys } from '@/lib/useHotkeys'
import type { PrFinding } from '@scout/shared'

const COLUMN = 'flex h-[calc(100dvh-var(--shell-h))] w-full min-w-0 flex-col gap-3 px-6 pt-4 pb-5'

/** Swipe mode: ←/→ move between findings; A / X approve or reject the suggested comment (toggles, like the card's buttons). */
function FindingHotkeys({ finding, go }: { finding: PrFinding; go: (delta: number) => void }) {
  const proposal = useProposal(finding)
  useHotkeys({ prev: () => go(-1), next: () => go(1), approve: () => proposal?.toggleApprove(), reject: () => proposal?.toggleReject() })
  return null
}

/**
 * `/s/:id/evidence/:findingId?` of a PR review: every finding of the report as a card (steps with their evidence,
 * Expected / Actual, the suggested comment and everything said on its lines). `?mode=` is swipe (one card at a time,
 * the default) or grid (every finding as a tile); the list is in the rail.
 */
export function PrEvidencePage() {
  const { sessionId } = useSessionContext()
  const { report } = useCurrentPrReport()
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = parseRunMode(searchParams.get(MODE_PARAM))
  const findings = report?.findings ?? []
  const commentCounts = useFindingCommentCounts(findings)
  const onSelect = useCallback((id: string) => navigate({ pathname: evidenceRoute(sessionId, id), search: searchParams.toString() }, { replace: true }), [navigate, sessionId, searchParams])
  const openInDeck = useCallback((id: string) => navigate({ pathname: evidenceRoute(sessionId, id), search: modeSearch(searchParams, 'swipe') }, { replace: true }), [navigate, sessionId, searchParams])

  const first = findings[0]
  if (!first) {
    return (
      <main className={COLUMN}>
        <PageHeader title="Evidence" />
        <EmptyState
          icon={SearchCheck}
          title={report ? 'No findings' : 'No review report yet'}
          description={report ? 'The review skills found nothing to reproduce on this PR.' : 'Findings and their evidence show here once a review skill publishes its report.'}
        />
      </main>
    )
  }
  const urlId = params['*'] ?? ''
  const index = findings.findIndex((finding) => finding.id === urlId)
  const current = findings[index]
  if (!current) return <Navigate to={{ pathname: evidenceRoute(sessionId, first.id), search: searchParams.toString() }} replace />

  const go = (delta: number) => {
    const next = findings[index + delta]
    if (next) onSelect(next.id)
  }
  const evidence = findings.reduce((sum, finding) => sum + finding.reproduction.evidence.length, 0)
  const said = [...commentCounts.values()].reduce((sum, count) => sum + count, 0)

  return (
    <main className={COLUMN}>
      <FindingsRailSection findings={findings} commentCounts={commentCounts} currentId={current.id} onSelect={onSelect} />
      <PageHeader title="Evidence" summary={<>{pluralize(findings.length, 'finding')} · {pluralize(evidence, 'evidence item')} · {pluralize(said, 'comment')}</>} />
      {mode === 'grid' ? (
        <FindingGrid findings={findings} currentId={current.id} commentCounts={commentCounts} onOpen={openInDeck} />
      ) : (
        <>
          <FindingHotkeys finding={current} go={go} />
          <FindingDeck findings={findings} currentId={current.id} commentCounts={commentCounts} onNavigate={onSelect} />
        </>
      )}
    </main>
  )
}
