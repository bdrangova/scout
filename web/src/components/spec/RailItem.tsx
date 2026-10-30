import { MessageSquare, type LucideIcon } from 'lucide-react'
import { useContext, type ReactNode } from 'react'
import { SidebarContext } from '@/components/layout/sidebar-context'
import { cn } from '@/lib/utils'

/** Wraps a row's action so that in the narrow-screen drawer the rail closes and the page shows what was picked. */
function useClosingDrawer(action: () => void): () => void {
  const sidebar = useContext(SidebarContext)
  return () => {
    action()
    if (sidebar && !sidebar.desktop) sidebar.close()
  }
}

export interface RailItemProps {
  icon: LucideIcon
  title: string
  /** The muted second line: a kind (`Jira ticket`) or a file name (`plan.md`, set `mono`). */
  subtitle: string
  mono?: boolean
  /** Let the title wrap to two lines (Extras) instead of one. */
  twoLines?: boolean
  /** The row for the card in view: yellow fill. */
  current?: boolean
  /** Open comments on the item; nothing shown at 0. */
  comments?: number
  onSelect: () => void
}

/** One source or extra in the rail block: icon box, title over subtitle, open comment count. */
export function RailItem({ icon: Icon, title, subtitle, mono = false, twoLines = false, current = false, comments = 0, onSelect }: RailItemProps) {
  const select = useClosingDrawer(onSelect)
  return (
    <button
      type="button"
      data-slot="rail-item"
      aria-current={current ? 'true' : undefined}
      title={`${title} · ${subtitle}`}
      onClick={select}
      className={cn(
        'flex min-h-10 w-full min-w-0 shrink-0 items-center gap-[9px] rounded-[10px] border-fine px-2 py-[5px] text-left text-[13px] font-semibold',
        current ? 'border-line bg-yellow text-on-yellow' : 'border-transparent hover:bg-paper',
      )}
    >
      <span className={cn('grid size-[26px] shrink-0 place-items-center rounded-[7px] border-fine', current ? 'border-on-yellow bg-on-yellow text-yellow' : 'border-line bg-paper')}>
        <Icon aria-hidden className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={cn('leading-[17px]', twoLines ? 'line-clamp-2 break-words' : 'truncate')}>{title}</span>
        <span className={cn('truncate text-[11.5px] font-medium', current ? 'text-on-yellow/80' : 'text-ink-muted', mono && 'font-mono text-[11px]')}>{subtitle}</span>
      </span>
      {comments > 0 && (
        <span className="inline-flex shrink-0 items-center gap-[3px] text-[11.5px] font-bold tabular-nums" title={`${comments} open ${comments === 1 ? 'comment' : 'comments'}`}>
          <MessageSquare aria-hidden className="size-3" />
          <span aria-hidden>{comments}</span>
          <span className="sr-only">
            {comments} open {comments === 1 ? 'comment' : 'comments'}
          </span>
        </span>
      )}
    </button>
  )
}

export interface RailHeadingItemProps {
  text: string
  /** The heading nearest the top of the card in view: bold ink. */
  current?: boolean
  onSelect: () => void
}

/** A heading nested under its source, joined to it by the elbow line. */
export function RailHeadingItem({ text, current = false, onSelect }: RailHeadingItemProps) {
  const select = useClosingDrawer(onSelect)
  return (
    <button
      type="button"
      data-slot="rail-heading-item"
      aria-current={current ? 'true' : undefined}
      title={text}
      onClick={select}
      className={cn(
        'relative min-h-7 w-full min-w-0 shrink-0 truncate rounded-[10px] py-[3px] pr-2 pl-[43px] text-left text-[12.5px]',
        "before:absolute before:-top-1.5 before:bottom-1/2 before:left-5 before:w-3 before:rounded-bl-[7px] before:border-b-fine before:border-l-fine before:border-line before:content-['']",
        current ? 'font-bold text-ink' : 'font-medium text-ink-muted hover:text-ink',
      )}
    >
      {text}
    </button>
  )
}

export interface RailBlockProps {
  title: string
  count: number
  /** The eyebrow at the right of the header (`sources`). */
  hint?: string
  /** Items listed while a filter narrows the block: the badge reads `shown of count`. */
  shown?: number
  /** A control at the right of the header (the "only commented" toggle). */
  action?: ReactNode
  children: ReactNode
}

/** The page block of the rail: a header (title, count, hint, an optional control) over a scrolling list. */
export function RailBlock({ title, count, hint, shown, action, children }: RailBlockProps) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col px-2.5 pt-3">
      <div className="flex shrink-0 items-center gap-2 px-1.5 pb-2.5">
        <h2 className="m-0 text-[15px] font-bold">{title}</h2>
        <span className="inline-flex min-w-5 items-center justify-center rounded-full border-fine border-line px-1.5 text-[11px] font-bold tabular-nums">{shown === undefined ? count : `${shown} of ${count}`}</span>
        {hint && <span className="ml-auto text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase">{hint}</span>}
        {action && <span className={hint ? 'ml-1' : 'ml-auto'}>{action}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3">{children}</div>
    </section>
  )
}
