import { CLOSED_PR_STATUSES, type PrReviewStatus, type PrStatus } from '@scout/shared'
import { Archive, CircleCheck, CircleCheckBig, CircleDashed, EyeOff, ListChecks, MessageSquare, type LucideIcon } from 'lucide-react'

export interface PrStatusSpec {
  label: string
  icon: LucideIcon
  /** Text and icon colour. */
  textClass: string
}

/** One wording, icon and colour per PR status, shared by PR review sessions (the first three) and the Assigned PRs tab. */
export const PR_STATUS_SPEC: Record<PrStatus, PrStatusSpec> = {
  pending: { label: 'Pending', icon: CircleDashed, textClass: 'text-ink-muted' },
  'in-progress': { label: 'In progress', icon: ListChecks, textClass: 'text-st-progress' },
  commented: { label: 'Commented', icon: MessageSquare, textClass: 'text-st-changes' },
  approved: { label: 'Approved', icon: CircleCheckBig, textClass: 'text-st-approved' },
  done: { label: 'Done', icon: CircleCheck, textClass: 'text-green' },
  ignored: { label: 'Ignored', icon: EyeOff, textClass: 'text-ink-muted' },
  archived: { label: 'Archived', icon: Archive, textClass: 'text-ink-muted' },
}

/** The statuses you can give a PR review session yourself; Approved closes it. */
export const PR_REVIEW_STATUS_OPTIONS: readonly PrReviewStatus[] = ['in-progress', 'commented', 'approved']

/** Done, Ignored and Archived PRs are closed; Approved stays open until the PR is merged. */
export function isClosedPr(status: PrStatus): boolean {
  return CLOSED_PR_STATUSES.includes(status)
}
