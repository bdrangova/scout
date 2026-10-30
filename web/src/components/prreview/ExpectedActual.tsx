import type { PrFinding } from '@scout/shared'
import { CircleCheck, CircleX } from 'lucide-react'
import { cn } from '@/lib/utils'

const BOX = 'rounded-lg border-2 px-3 py-2'
const LABEL = 'flex items-center gap-1.5 text-[10.5px] font-bold tracking-[.08em] uppercase [&_svg]:size-3.5'

/**
 * Expected beside Actual, told apart at a glance: Expected in green, Actual in red when the problem was
 * reproduced (amber otherwise, where what happened is less certain). Side by side from `sm`, stacked below.
 */
export function ExpectedActual({ reproduction: r, className }: { reproduction: PrFinding['reproduction']; className?: string }) {
  const actualTone = r.status === 'reproduced' ? 'border-err-bd bg-err-bg/50 [--ea:var(--err-bd)]' : 'border-warn-bd bg-warn-bg/50 [--ea:var(--warn-bd)]'
  return (
    <div className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
      <div className={cn(BOX, 'border-ok-bd bg-ok-bg/50')}>
        <strong className={cn(LABEL, 'text-ok-bd')}><CircleCheck aria-hidden />Expected</strong>
        {r.expected}
      </div>
      <div className={cn(BOX, actualTone)}>
        <strong className={cn(LABEL, 'text-(--ea)')}><CircleX aria-hidden />Actual</strong>
        {r.actual}
      </div>
    </div>
  )
}
