import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CommentHeaderProps {
  collapsed: boolean
  onToggle: () => void
  avatar: ReactNode
  title: ReactNode
  /** Names the fold toggle for screen readers ("Expand <label>"). */
  label: string
  badges?: ReactNode
  /** A one-line preview shown after the badges while folded. */
  preview?: string
  actions?: ReactNode
}

/**
 * The one header row every comment shares (Scout's notes, the reviewer's own, GitHub's): caret, avatar and title
 * (all three fold the comment), the badges, then the actions on the right.
 */
export function CommentHeader({ collapsed, onToggle, avatar, title, label, badges, preview, actions }: CommentHeaderProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
        onClick={onToggle}
        className="flex min-w-20 shrink items-center gap-2 rounded-sm text-left"
      >
        <Chevron aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        {avatar}
        <span className="min-w-0 truncate font-bold">{title}</span>
      </button>
      {badges && <span className="flex min-w-0 shrink flex-wrap items-center gap-1.5">{badges}</span>}
      {collapsed && preview ? (
        <button type="button" tabIndex={-1} aria-hidden onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-ink-muted hover:text-ink">
          {preview}
        </button>
      ) : (
        <span className="flex-1" />
      )}
      {actions && <span className="flex shrink-0 items-center gap-0.5">{actions}</span>}
    </div>
  )
}

/** One action in a comment's header: a small ghost button with an icon, like Scout's Reply. */
export function CommentAction({ icon: Icon, children, className, ...props }: ComponentProps<typeof Button> & { icon: LucideIcon }) {
  return (
    <Button size="sm" variant="ghost" className={cn('h-6 px-2 text-xs', className)} {...props}>
      <Icon aria-hidden className="size-3.5" />
      {children}
    </Button>
  )
}

/** The reviewer's own avatar. */
export function YouAvatar() {
  return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full border-fine border-fill-line bg-ink text-[9px] font-bold text-paper">
      You
    </span>
  )
}

