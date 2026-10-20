import { GitPullRequest } from 'lucide-react'
import type { PrFileCounts } from '@/lib/pr-threads'
import { cn } from '@/lib/utils'
import { prCountText } from './pr-format'

/** A PR-icon count for a tree row or tile; bold when something is still open (the word is for screen readers and the tooltip). */
export function PrCount({ counts, className }: { counts: PrFileCounts; className?: string }) {
  if (counts.total === 0) return null
  return (
    <span title={prCountText(counts)} data-pr-count={counts.total} className={cn('inline-flex items-center gap-0.5 text-[11px] tabular-nums', counts.open > 0 ? 'font-bold' : 'font-medium', className)}>
      <GitPullRequest aria-hidden className="size-3!" />
      {counts.total}
      <span className="sr-only">{prCountText(counts)}</span>
    </span>
  )
}
