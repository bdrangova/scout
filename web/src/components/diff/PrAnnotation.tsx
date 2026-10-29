import { anchorKey, type LineAnchor } from '@scout/shared'
import { PrThreadList } from '@/components/prcomments/PrThreadList'
import type { PrThread } from '@/lib/pr-threads'
import { SLOT_CLASS } from './LineAnnotation'

/** The GitHub threads under a diff line, each in its own card like the reviewer's own comments. */
export function PrAnnotation({ anchor, threads }: { anchor: LineAnchor; threads: PrThread[] }) {
  return (
    <div className={SLOT_CLASS} data-pr-comments={anchorKey(anchor)}>
      <PrThreadList threads={threads} label="GitHub comments on this line" />
    </div>
  )
}
