import type { PrCommentView } from '@scout/shared'
import { ExternalLink, ShieldAlert } from 'lucide-react'
import { Tag } from '@/components/ui/tag'
import { PrAuthor } from './PrAuthor'
import { prLocationLabel } from './pr-format'
import { PrStatusChip } from './PrStatusChip'
import { formatRelativeTime } from '@/lib/format'

/** Author, time, (for a thread's root) its status, and the link to GitHub: one row above a comment's body. */
export function PrCommentMeta({ view, root = false, showLocation = false }: { view: PrCommentView; root?: boolean; showLocation?: boolean }) {
  const location = showLocation ? prLocationLabel(view) : null
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
      <PrAuthor author={view.author} />
      <time dateTime={view.createdAt} title={view.createdAt} className="text-[11px] text-ink-muted">
        {formatRelativeTime(view.createdAt)}
      </time>
      {root && <PrStatusChip view={view} />}
      {root && !view.trusted && (
        <Tag size="sm" tone="warn" title="Untrusted author: text not sent to agent">
          <ShieldAlert aria-hidden />
          Not sent to agent
        </Tag>
      )}
      {location && <span className="font-mono text-[11px] text-st-r">{location}</span>}
      <a
        href={view.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${view.author.login}'s comment on GitHub`}
        className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
      >
        View on GitHub
        <ExternalLink aria-hidden className="size-3" />
      </a>
    </div>
  )
}
