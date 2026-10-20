import type { PrCommentView } from '@review-dash/shared'
import { Tag } from '@/components/ui/tag'
import { PR_STATUS, prStatusLabel } from './pr-status'

/** The status of a PR comment: icon, tone and word; addressed and declined keep the word for screen readers only (the card's colour says it). */
export function PrStatusChip({ view }: { view: Pick<PrCommentView, 'status' | 'closedBy'> }) {
  const { icon: Icon, tone, tint } = PR_STATUS[view.status]
  const label = prStatusLabel(view)
  return (
    <Tag tone={tone} size="sm" data-status={view.status} title={label}>
      <Icon aria-hidden />
      {tint ? <span className="sr-only">{label}</span> : label}
    </Tag>
  )
}
