import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommentedOnlyToggleProps {
  /** Items in the list with open comments: worn as a badge; at zero the toggle is disabled. */
  count: number
  active: boolean
  onToggle: () => void
  /** `md` sits beside the Files search box; `sm` fits a block header. */
  size?: 'md' | 'sm'
  className?: string
}

/** The rail's comment-bubble switch: pressed, the list shows only the items carrying open comments. */
export function CommentedOnlyToggle({ count, active, onToggle, size = 'md', className }: CommentedOnlyToggleProps) {
  const label = active ? 'Show all items' : count === 0 ? 'No items with open comments' : 'Show only items with open comments'
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label="Only commented"
      title={label}
      disabled={count === 0}
      onClick={onToggle}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-md border-fine border-line text-ink-muted hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'size-8' : 'size-7',
        active && 'border-ink bg-ink text-paper hover:bg-ink hover:text-paper',
        className,
      )}
    >
      <MessageSquare aria-hidden className={size === 'md' ? 'size-4' : 'size-3.5'} />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-[6px] -right-[7px] grid h-4 min-w-4 place-items-center rounded-full border-fine border-ink bg-yellow px-1 text-[10px] font-bold text-on-yellow tabular-nums"
        >
          {count}
        </span>
      )}
      <span className="sr-only">, {count} with open comments</span>
    </button>
  )
}
