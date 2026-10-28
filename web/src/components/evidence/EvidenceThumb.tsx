import type { EvidenceItem } from '@scout/shared'
import { Film, MessageSquare } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { pluralize } from '@/lib/format'
import { evidenceUrl, splitPath } from '@/lib/paths'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'
import { cn } from '@/lib/utils'

export interface EvidenceThumbProps {
  item: EvidenceItem
  /** One-based position in the list. */
  position: number
  sessionId: string
  current: boolean
  onSelect: (path: string) => void
}

/** One row of the rail's evidence list: a preview, the file name, the caption on one line, and the open-comment count (or the position). The current one is yellow. */
export function EvidenceThumb({ item, position, sessionId, current, onSelect }: EvidenceThumbProps) {
  const open = useOpenCommentCount('evidence', item.path)
  const ref = useRef<HTMLButtonElement>(null)
  const { name } = splitPath(item.path)
  const detail = [item.type, open > 0 ? pluralize(open, 'comment') : null].filter(Boolean).join(' · ')

  // Keep the current row visible when the list scrolls (arrow keys, header buttons). Only the list scrolls, not the page.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <li>
      <button
        ref={ref}
        type="button"
        aria-current={current ? 'true' : undefined}
        aria-label={`${name} (${detail})`}
        title={`${name}\n${item.caption}`}
        onClick={() => onSelect(item.path)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border-fine border-line bg-surface p-1.5 text-left text-ink transition-colors hover:bg-hover',
          current && 'border-fill-line bg-yellow text-on-yellow hover:bg-yellow',
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border-fine border-line bg-paper-2 text-ink-muted">
          {item.type === 'image' ? (
            <img src={evidenceUrl(sessionId, item.path)} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Film aria-hidden className="size-5" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono text-xs font-semibold">{name}</span>
          <span className={cn('truncate text-xs font-medium text-ink-muted', current && 'text-on-yellow/80')}>{item.caption}</span>
        </span>
        {open > 0 ? (
          <span aria-hidden className="inline-flex shrink-0 items-center gap-1 pr-1 text-xs font-bold tabular-nums">
            <MessageSquare className="size-3.5 stroke-[2.25]" />
            {open}
          </span>
        ) : (
          <span aria-hidden className={cn('shrink-0 pr-1.5 font-mono text-xs font-semibold text-ink-muted tabular-nums', current && 'text-on-yellow/80')}>
            {position}
          </span>
        )}
      </button>
    </li>
  )
}
