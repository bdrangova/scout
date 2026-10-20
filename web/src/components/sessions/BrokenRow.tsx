import type { SessionListItem } from '@review-dash/shared'
import { TriangleAlert } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { cn } from '@/lib/utils'
import { SESSION_GRID, SESSION_META } from './grid'

interface BrokenRowProps {
  item: Extract<SessionListItem, { error: string }>
}

/** A session whose manifest failed to load: its id and the error; nothing to open. */
export function BrokenRow({ item }: BrokenRowProps) {
  return (
    <li aria-label={`Broken session ${item.id}`}>
      <Panel className={cn(SESSION_GRID, 'flex flex-col gap-3 border-dashed bg-surface/60 px-5 py-4 text-ink-muted')}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-2 font-mono text-sm text-ink">
            <TriangleAlert className="size-4 shrink-0 text-st-m" aria-hidden />
            <span className="truncate">{item.id}</span>
          </span>
          <span className="truncate text-xs" title={item.error}>
            {item.error}
          </span>
        </div>
        <div className={SESSION_META}>
          <span className="text-[13px]">—</span>
          <span className="text-[13px]">—</span>
          <div>
            <Tag tone="err">
              <TriangleAlert aria-hidden />
              Broken
            </Tag>
          </div>
          <span />
          <span />
        </div>
      </Panel>
    </li>
  )
}
