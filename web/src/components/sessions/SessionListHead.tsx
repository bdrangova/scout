import { ArrowRightLeft, CheckCheck, CircleDashed, Clock, Layers, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SESSION_GRID } from './grid'

const COLUMNS: readonly { label: string; icon: LucideIcon }[] = [
  { label: 'Session', icon: Layers },
  { label: 'Changes', icon: ArrowRightLeft },
  { label: 'Reviewed', icon: CheckCheck },
  { label: 'Status', icon: CircleDashed },
  { label: 'Updated', icon: Clock },
]

/** The eyebrow above the rows (hidden below `lg`, where the rows stack): icon and word (U4), each also a tooltip. */
export function SessionListHead() {
  return (
    <div className={cn(SESSION_GRID, 'hidden px-5 text-ink-muted lg:grid')} role="presentation">
      {COLUMNS.map(({ label, icon: Icon }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs font-bold" title={label}>
          <Icon className="size-3.5 stroke-[2.25]" aria-hidden />
          <span>{label}</span>
        </div>
      ))}
      <div />
    </div>
  )
}
