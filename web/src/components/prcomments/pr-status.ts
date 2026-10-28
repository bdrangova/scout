import type { PrCommentView } from '@scout/shared'
import { Ban, Check, CircleDot, History, type LucideIcon } from 'lucide-react'
import type { TagProps } from '@/components/ui/tag'

type PrStatus = PrCommentView['status']

/**
 * Open and outdated say their word; addressed and declined are carried by the card's wash (`tint`, the
 * same tokens as the file cards' approved/rejected overlay) and show an icon only, the word for screen readers.
 */
export const PR_STATUS: Record<PrStatus, { label: string; icon: LucideIcon; tone: NonNullable<TagProps['tone']>; edge: string; tint: string | null }> = {
  open: { label: 'Open', icon: CircleDot, tone: 'warn', edge: 'border-l-warn-bd', tint: null },
  addressed: { label: 'Addressed', icon: Check, tone: 'ok', edge: 'border-l-ok-bd', tint: 'bg-ok-bg/40' },
  declined: { label: 'Declined', icon: Ban, tone: 'err', edge: 'border-l-err-bd', tint: 'bg-err-bg/40' },
  outdated: { label: 'Outdated', icon: History, tone: 'neutral', edge: 'border-l-line', tint: null },
}

/** The word for a comment's status; an outdated one says why when GitHub closed it another way. */
export function prStatusLabel(view: Pick<PrCommentView, 'status' | 'closedBy'>): string {
  if (view.status !== 'outdated') return PR_STATUS[view.status].label
  if (view.closedBy === 'github-resolved') return 'Resolved on GitHub'
  if (view.closedBy === 'removed') return 'Deleted on GitHub'
  return PR_STATUS.outdated.label
}

/** `ffffffffffff` → `fffffff`: the short sha shown on chips. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}
