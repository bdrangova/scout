import type { Verdict } from '@scout/shared'
import { CheckIcon, CircleDashedIcon, MessageSquareIcon, XIcon, type LucideIcon } from 'lucide-react'

/** `commented` is not a stored verdict: it is `none` with open comments, shown on the list and the tree. */
export type VerdictKind = Verdict | 'commented'

export interface VerdictStyle {
  label: string
  icon: LucideIcon
  /** Text colour (and the icon's, unless `iconClassName` says otherwise); always >= 4.5:1 on the surfaces. */
  className: string
  /** Icon colour: the hue that carries the verdict, where the text stays ink (amber text on paper is under 4.5:1). */
  iconClassName: string
  /** Tinted tag classes (`Tag`-compatible) for a labelled verdict. */
  tagClassName: string
}

export const VERDICT_STYLE: Record<VerdictKind, VerdictStyle> = {
  approved: {
    label: 'Approved',
    icon: CheckIcon,
    className: 'text-green',
    iconClassName: 'text-green',
    tagClassName: 'bg-ok-bg border-ok-bd/50 text-ink',
  },
  rejected: {
    label: 'Changes requested',
    icon: XIcon,
    className: 'text-red',
    iconClassName: 'text-red',
    tagClassName: 'bg-err-bg border-err-bd/50 text-ink',
  },
  commented: {
    label: 'Commented',
    icon: MessageSquareIcon,
    className: 'text-ink',
    iconClassName: 'text-warn-bd',
    tagClassName: 'bg-warn-bg border-warn-bd/50 text-ink',
  },
  none: {
    label: 'Not reviewed',
    icon: CircleDashedIcon,
    className: 'text-ink-muted',
    iconClassName: 'text-ink-muted',
    tagClassName: 'bg-paper-2 border-line text-ink-muted',
  },
}

export function verdictKind(verdict: Verdict, openComments: number): VerdictKind {
  return verdict === 'none' && openComments > 0 ? 'commented' : verdict
}
