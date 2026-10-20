import { anchorKey, type LineAnchor } from '@review-dash/shared'
import { PrThreadList } from '@/components/prcomments/PrThreadList'
import type { PrThread } from '@/lib/pr-threads'
import { PANEL_CLASS } from './LineAnnotation'

/** The GitHub threads under a diff line, in the same raised panel as the reviewer's own comments. */
export function PrAnnotation({ anchor, threads }: { anchor: LineAnchor; threads: PrThread[] }) {
  return (
    <div className={PANEL_CLASS} data-pr-comments={anchorKey(anchor)}>
      <PrThreadList threads={threads} label="GitHub comments on this line" />
    </div>
  )
}
