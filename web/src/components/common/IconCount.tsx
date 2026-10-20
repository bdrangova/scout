import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatLabel } from './StatLabel'

export interface IconCountProps {
  icon: LucideIcon
  count: number
  /** `2 items`, `1 open comment`: the tooltip (the enclosing group carries the accessible text). */
  label: string
  /** From `lg` up show `label` in words (`6 screenshots`) instead of the bare number (U4). */
  showLabel?: boolean
  className?: string
}

/** The `.counts` of the page headers: a 15px icon and a tabular number. */
export function IconCount({ icon: Icon, count, label, showLabel = false, className }: IconCountProps) {
  return (
    <span title={label} className={cn('inline-flex items-center gap-[5px] text-[13px] font-bold text-ink-muted tabular-nums', className)}>
      <Icon aria-hidden className="size-[15px]" />
      <span className={cn(showLabel && 'lg:hidden')}>{count}</span>
      {showLabel && <StatLabel className="font-bold">{label}</StatLabel>}
    </span>
  )
}
