import type { TreeFile, Verdict } from '@scout/shared'
import { MessageSquareIcon } from 'lucide-react'
import { PrCount } from '@/components/prcomments/PrCount'
import { Tag } from '@/components/ui/tag'
import type { PrFileCounts } from '@/lib/pr-threads'
import { VERDICT_STYLE, verdictKind } from '@/lib/verdict'
import { cn } from '@/lib/utils'

export interface FileTileFooterProps {
  file: TreeFile
  verdict: Verdict
  viewed: boolean
  openComments: number
  updated: boolean
  prComments?: PrFileCounts
  reviewable: boolean
}

/** The review word ("Unreviewed", "Viewed", "Approved", …) and the file's chips (Collapsed, Binary, Updated, Renamed). */
export function FileTileFooter({ file, verdict, viewed, openComments, updated, prComments, reviewable }: FileTileFooterProps) {
  const kind = verdictKind(verdict, openComments)
  const renamedFrom = file.oldPath !== null && file.oldPath !== file.path ? file.oldPath : null
  return (
    <span className="flex min-h-[22px] w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-muted">
      {!reviewable ? (
        <span title="A later change undid this one">no net change</span>
      ) : (
        <ReviewWord kind={kind} viewed={viewed} />
      )}
      {openComments > 0 && (
        <span className="inline-flex items-center gap-1 tabular-nums" title={`${openComments} open ${openComments === 1 ? 'comment' : 'comments'}`}>
          <MessageSquareIcon aria-hidden className="size-3" /> {openComments}
        </span>
      )}
      {prComments && <PrCount counts={prComments} />}
      <span className="ml-auto flex flex-wrap items-center gap-1 empty:hidden">
        {updated && (
          <Tag size="sm" tone="warn" title="Changed on disk since you reviewed it">
            Updated<span className="hidden lg:inline"> since sent</span>
          </Tag>
        )}
        {file.binary && <Tag size="sm">Binary</Tag>}
        {file.omitted && <Tag size="sm">Omitted</Tag>}
        {file.collapsed && !file.omitted && <Tag size="sm">Collapsed</Tag>}
        {renamedFrom && (
          <Tag size="sm" tone="info" title={`renamed from ${renamedFrom}`}>
            Renamed
          </Tag>
        )}
      </span>
    </span>
  )
}

function ReviewWord({ kind, viewed }: { kind: ReturnType<typeof verdictKind>; viewed: boolean }) {
  if (kind === 'none') return <span className={cn(viewed && 'text-ink')}>{viewed ? 'Viewed' : 'Unreviewed'}</span>
  const style = VERDICT_STYLE[kind]
  const Icon = style.icon
  const word = kind === 'approved' ? 'Approved' : kind === 'rejected' ? 'Rejected' : 'Commented'
  return (
    <span className={cn('inline-flex items-center gap-[5px] font-bold', style.className)}>
      <Icon aria-hidden className={cn('size-[13px] stroke-[3]', style.iconClassName)} /> {word}
    </span>
  )
}
