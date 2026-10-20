import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** A button or link under the text. */
  action?: ReactNode
  className?: string
}

/** A dashed, flat frame with a round icon: "nothing here", for empty folders and lists. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn(
        'flex flex-col items-center gap-2.5 rounded-2xl border-fine border-dashed border-line bg-surface/60 px-6 py-12 text-center',
        className,
      )}
    >
      <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full border-fine border-line bg-paper-2 text-ink-muted">
        <Icon className="size-[18px]" />
      </span>
      <p className="m-0 text-[15px] font-bold text-ink">{title}</p>
      {description && <p className="m-0 max-w-md text-[13px] text-ink-muted">{description}</p>}
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  )
}
