import { MessageSquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ItemKind } from '@/components/spec/item-kinds'
import { TARGET_ATTR } from '@/components/spec/rail-targets'
import { fileTypeClass, fileTypeOf } from '@/lib/file-type'
import { pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How many headings a tile lists before "+N more". */
const MAX_HEADINGS = 4

export interface ItemTileProps {
  /** The item's path in its folder: the band's colour, the rail's scroll target. */
  path: string
  kind: ItemKind
  title: ReactNode
  /** The plain name for the button (`Open <label>`). */
  label: string
  /** The muted line under the title: the file name (`mono`) or the kind. */
  subtitle?: string
  mono?: boolean
  /** The outline the rail lists under the item. */
  headings?: readonly string[]
  openComments: number
  onOpen: () => void
}

/**
 * One spec source or extra in the grid, styled like a Files tile: a band in the file type's colour,
 * the kind, title and file name, its outline and its open comments. A click opens it in the scroll view.
 */
export function ItemTile({ path, kind, title, label, subtitle, mono = false, headings = [], openComments, onOpen }: ItemTileProps) {
  const Icon = kind.icon
  const more = headings.length - MAX_HEADINGS
  return (
    <li
      {...{ [TARGET_ATTR]: path }}
      className={cn(
        fileTypeClass(fileTypeOf(path).id),
        'group relative rounded-xl border-fine border-line bg-surface text-ink transition-colors hover:bg-paper-2',
        'has-[>button:focus-visible]:outline-[3px] has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-focus',
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[7px] rounded-t-[10px] border-b-fine border-fill-line bg-ft" />
      <button
        type="button"
        aria-label={`Open ${label}`}
        title={path}
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-[9px] rounded-[inherit] px-3.5 pt-5 pb-[13px] text-left focus-visible:outline-none"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-[6px] border-fine border-line bg-paper text-ink">
            <Icon aria-hidden className="size-3" />
          </span>
          {kind.label}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm leading-[19px] font-bold break-words">{title}</span>
          {subtitle && <span className={cn('truncate text-xs text-ink-muted', mono && 'font-mono')}>{subtitle}</span>}
        </span>
        {headings.length > 0 && (
          <span className="flex min-w-0 flex-col gap-0.5 border-l-fine border-line pl-2.5 text-xs font-medium text-ink-muted">
            {headings.slice(0, MAX_HEADINGS).map((heading, index) => (
              <span key={`${heading}#${index}`} className="truncate">
                {heading}
              </span>
            ))}
            {more > 0 && <span className="font-semibold">+{more} more</span>}
          </span>
        )}
        <span className="mt-auto flex min-h-[22px] items-center gap-1 text-xs font-medium text-ink-muted tabular-nums">
          {openComments > 0 ? (
            <>
              <MessageSquareIcon aria-hidden className="size-3" />
              <span className="text-ink">{pluralize(openComments, 'open comment')}</span>
            </>
          ) : (
            'No open comments'
          )}
        </span>
      </button>
    </li>
  )
}

/** The grid view of the Spec and Extras pages: tiles in the Files grid's columns. */
export function ItemGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
      {children}
    </ul>
  )
}
