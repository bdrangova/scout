import type { AgentRun, CommentWithStatus, Review } from '@scout/shared'
import { RailSection } from '@/components/layout/RailSlot'
import type { SectionDetail } from './open-comments-sections'
import { RailRuns } from './RailRuns'
import { WillBeSent } from './WillBeSent'

interface SubmitRailSectionProps {
  comments: readonly CommentWithStatus[]
  review: Review
  detail: SectionDetail
  runs: readonly AgentRun[]
  selectedRunId: string | null
  onSelectRun: (run: AgentRun) => void
}

/** The Submit page's block in the session rail: what will be sent, then the run history. */
export function SubmitRailSection({ comments, review, detail, runs, selectedRunId, onSelectRun }: SubmitRailSectionProps) {
  return (
    <RailSection>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-3.5">
        <WillBeSent comments={comments} review={review} detail={detail} />
        <hr className="m-0 border-0 border-t-fine border-line" />
        <RailRuns runs={runs} selectedId={selectedRunId} onSelect={onSelectRun} />
      </div>
    </RailSection>
  )
}
