import { GitPullRequest } from 'lucide-react'
import { Tag } from '@/components/ui/tag'
import type { PrFileCounts } from '@/lib/pr-threads'
import { pluralize } from '@/lib/format'

/** The card header's "N PR comments" chip; the open count is the bold part. */
export function PrCardChip({ counts }: { counts: PrFileCounts }) {
  if (counts.total === 0) return null
  return (
    <Tag size="sm" className="bg-surface" data-pr-chip>
      <GitPullRequest aria-hidden />
      {pluralize(counts.total, 'PR comment')}
      {counts.open > 0 && (
        <>
          <span aria-hidden>·</span>
          <strong className="font-extrabold">{counts.open} open</strong>
        </>
      )}
    </Tag>
  )
}
