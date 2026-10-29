import type { CommentWithStatus, Review } from '@scout/shared'
import { RailSection } from '@/components/layout/RailSlot'
import type { SectionDetail } from './open-comments-sections'
import { WillBeSent } from './WillBeSent'

interface SubmitRailSectionProps {
  comments: readonly CommentWithStatus[]
  review: Review
  detail: SectionDetail
}

/** The Submit page's block in the session rail: what will be sent. */
export function SubmitRailSection({ comments, review, detail }: SubmitRailSectionProps) {
  return (
    <RailSection>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-3.5">
        <WillBeSent comments={comments} review={review} detail={detail} />
      </div>
    </RailSection>
  )
}
