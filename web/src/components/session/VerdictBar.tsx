import { formatVerdictSummary, type VerdictSummary } from '@/components/submit/verdict-summary'
import { cn } from '@/lib/utils'

const SEGMENTS = [
  { key: 'approved', className: 'bg-green' },
  { key: 'rejected', className: 'bg-red-solid' },
  { key: 'commented', className: 'bg-st-m' },
] as const

/**
 * The review as one bar split by verdict (approved, rejected, commented; the rest stays empty).
 * One image for assistive technology, read as `3 approved · 1 rejected · 1 commented · 3 not reviewed`.
 */
export function VerdictBar({ summary, className }: { summary: VerdictSummary; className?: string }) {
  const total = summary.approved + summary.rejected + summary.commented + summary.notReviewed
  return (
    <span
      role="img"
      aria-label={formatVerdictSummary(summary)}
      data-slot="verdict-bar"
      className={cn('flex h-3.5 min-w-0 overflow-hidden rounded-full border-fine border-line bg-surface', className)}
    >
      {SEGMENTS.map(({ key, className: color }) =>
        summary[key] > 0 ? <i key={key} className={cn('block h-full border-r-fine border-paper-2 last:border-r-0', color)} style={{ width: `${(summary[key] / total) * 100}%` }} /> : null,
      )}
    </span>
  )
}
