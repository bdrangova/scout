import type { CommentWithStatus, Review } from '@review-dash/shared'
import { MessageSquareIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Tag } from '@/components/ui/tag'
import { usePrComments } from '@/state/pr-comments-context'
import { cn } from '@/lib/utils'
import { VERDICT_STYLE } from '@/lib/verdict'
import { useJumpToPanel } from './jump-to-panel'
import { commentSections, isTestRunSection, type SectionDetail } from './open-comments-sections'
import { RailHead } from './RailHead'
import { UnsavedDraftsNotice } from './UnsavedDraftsNotice'
import { prReplyRows, sendCounts, summaryRows } from './will-be-sent'

interface WillBeSentProps {
  comments: readonly CommentWithStatus[]
  review: Review
  detail: SectionDetail
}

/** The rail's summary of the send: counts by kind and the files that carry comments, each a link to its card. */
export function WillBeSent({ comments, review, detail }: WillBeSentProps) {
  const open = useMemo(() => comments.filter((comment) => comment.status === 'open'), [comments])
  const counts = useMemo(() => sendCounts(open), [open])
  const { queued } = usePrComments()
  const rows = [...summaryRows(counts), ...prReplyRows(queued)]
  const total = counts.total + queued.instructions + queued.replies
  // The rows that link to a card: the files of a code review, the scenarios of a test run.
  const files = useMemo(
    () => commentSections(open, review, detail).find((section) => section.key === 'files' || section.key === 'scenarios')?.groups ?? [],
    [open, review, detail],
  )
  const itemLabel = isTestRunSection(detail) ? 'Scenarios with comments' : 'Files with comments'
  return (
    <section aria-label="Will be sent" className="flex flex-col gap-2.5">
      <RailHead title="Will be sent" count={total}>
        {total > 0 && <JumpToComments />}
      </RailHead>
      <UnsavedDraftsNotice className="w-full" />
      {rows.length === 0 ? (
        <p className="m-0 text-[12.5px] font-medium text-ink-muted">No open comments. The decision alone is sent.</p>
      ) : (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          {rows.map((row) => (
            <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
              <dt className="font-semibold text-ink-muted">{row.label}</dt>
              <dd className="m-0 text-right font-bold tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {files.length > 0 && (
        <ul aria-label={itemLabel} className="m-0 flex list-none flex-col p-0">
          {files.map((group) => {
            const chip = group.chip ? VERDICT_STYLE[group.chip] : null
            const ChipIcon = chip?.icon
            return (
              <li key={group.key}>
                <Link
                  to={group.to}
                  relative="path"
                  title={group.key}
                  className="flex min-h-[34px] items-center gap-2 rounded-sm px-1.5 text-[12.5px] hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  <span className={cn('min-w-0 flex-1 truncate font-semibold', !isTestRunSection(detail) && 'font-mono')}>{group.label}</span>
                  <span className="inline-flex items-center gap-1 font-bold text-ink-muted tabular-nums" title={`${group.comments.length} open`}>
                    <MessageSquareIcon className="size-3" aria-hidden />
                    {group.comments.length}
                    <span className="sr-only"> open comments</span>
                  </span>
                  {chip && ChipIcon && (
                    <Tag size="sm" className={chip.tagClassName} title={chip.label}>
                      <ChipIcon aria-hidden />
                      <span className="sr-only">{chip.label}</span>
                    </Tag>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function JumpToComments() {
  const jump = useJumpToPanel('open-comments')
  return (
    <button type="button" onClick={jump} className="text-xs font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline">
      Jump to comments
    </button>
  )
}
