import type { BoxInfo } from './box-info'

/** How far the review of a box got; decides the wash drawn over it. */
export type BoxState = 'approved' | 'rejected' | 'commented' | 'none'

/**
 * A file: its verdict, else "commented" when it carries open comments. A package: rejected as soon as one file is,
 * approved once every file is, else commented when any of its files carries open comments.
 */
export function boxStateOf(info: BoxInfo): BoxState {
  if (info.rejected > 0) return 'rejected'
  if (info.total > 0 && info.approved === info.total) return 'approved'
  return info.comments > 0 ? 'commented' : 'none'
}

/** The border of a box in each state. */
export const BOX_STATE_BORDER: Record<BoxState, string> = {
  approved: 'border-ok-bd',
  rejected: 'border-err-bd',
  commented: 'border-ink-muted border-dashed',
  none: '',
}

/** The wash over the whole box (band included): green, red, or grey for "commented, no verdict yet". */
export const BOX_STATE_WASH: Record<BoxState, string | null> = {
  approved: 'bg-[color-mix(in_srgb,var(--ok-bd)_20%,transparent)]',
  rejected: 'bg-[color-mix(in_srgb,var(--err-bd)_20%,transparent)]',
  commented: 'bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]',
  none: null,
}

export const BOX_STATE_WORD: Record<BoxState, string> = { approved: 'approved', rejected: 'rejected', commented: 'commented', none: '' }
