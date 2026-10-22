import { cn } from '@/lib/utils'
import { SESSION_GRID } from './grid'

export function SessionListHead() {
  return (
    <div className={cn(SESSION_GRID, 'hidden px-5 text-[11px] font-medium text-ink-muted lg:grid')} role="presentation">
      <span>Session</span><span>Review</span><span>Updated</span><span />
    </div>
  )
}
