import { Link } from 'react-router'
import { CommentList } from '@/components/common/CommentList'
import { Tag } from '@/components/ui/tag'
import { VERDICT_STYLE } from '@/lib/verdict'
import type { CommentActions } from '@/state/useCommentActions'
import type { TargetGroup } from './open-comments-sections'
import { GithubThreadItem } from './GithubThreadItem'
import { ResolvedComment } from './ResolvedComment'

export interface TargetBlockProps extends CommentActions {
  group: TargetGroup
}

/** One target (a file, an evidence item, …): its link, its verdict chip, its open and resolved comments, then the GitHub PR threads left on it. */
export function TargetBlock({ group, onEdit, onDelete, onResolve, onReopen }: TargetBlockProps) {
  const open = group.comments.filter((comment) => comment.status === 'open')
  const resolved = group.comments.filter((comment) => comment.status === 'resolved')
  const chip = group.chip ? VERDICT_STYLE[group.chip] : null
  const ChipIcon = chip?.icon
  return (
    <div className="flex flex-col gap-2" aria-label={group.label}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link to={group.to} relative="path" className="truncate font-mono text-[13px] font-semibold text-ink hover:underline">
          {group.label}
        </Link>
        {chip && ChipIcon && (
          <Tag size="sm" className={chip.tagClassName}>
            <ChipIcon aria-hidden />
            {chip.label}
          </Tag>
        )}
      </div>
      {open.length > 0 && <CommentList comments={open} onEdit={onEdit} onDelete={onDelete} onResolve={onResolve} onReopen={onReopen} />}
      {resolved.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={`Resolved comments on ${group.label}`}>
          {resolved.map((comment) => (
            <ResolvedComment key={comment.id} comment={comment} onReopen={onReopen} />
          ))}
        </ul>
      )}
      {group.prThreads.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`GitHub comments on ${group.label}`}>
          {group.prThreads.map((thread) => (
            <GithubThreadItem key={thread.root.id} thread={thread} />
          ))}
        </ul>
      )}
    </div>
  )
}
