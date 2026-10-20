import { useState } from 'react'
import { Markdown } from '@/components/common/Markdown'
import { cn } from '@/lib/utils'
import { isLongBody } from './pr-format'

/** A comment's markdown, rendered as third-party text (trusted authors too).  A long body is cut to a few lines with "Show more". */
export function PrCommentBody({ body, label }: { body: string; label: string }) {
  const long = isLongBody(body)
  const [expanded, setExpanded] = useState(false)
  const collapsed = long && !expanded
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className={cn('relative w-full min-w-0 overflow-x-auto break-words', collapsed && 'max-h-[7.5rem] overflow-y-hidden')}>
        <Markdown variant="untrusted" source={body} className="text-[13px]" />
        {collapsed && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-paper to-transparent" />}
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Show less' : 'Show more'} of ${label}`}
          onClick={() => setExpanded((value) => !value)}
          className="rounded-sm text-xs font-semibold text-ink-muted underline-offset-[3px] hover:text-ink hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
