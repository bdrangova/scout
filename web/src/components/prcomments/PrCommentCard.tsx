import { Bot, GitCommitHorizontal } from 'lucide-react'
import { Tag } from '@/components/ui/tag'
import type { PrThread } from '@/lib/pr-threads'
import { cn } from '@/lib/utils'
import { PR_STATUS, shortSha } from './pr-status'
import { PrCommentBody } from './PrCommentBody'
import { PrCommentMeta } from './PrCommentMeta'
import { PrReplyBox } from './PrReplyBox'

export interface PrCommentCardProps {
  thread: PrThread
  /** Name where the comment is, for a comment outside the diff (the footer group). */
  showLocation?: boolean
}

/**
 * One GitHub review thread, the root comment with its status, the replies nested under it,
 * and (once the agent answered) its note with the commit that fixed it. Same panel look as the
 * reviewer's own line comments; an addressed comment gets a green wash and a declined one a red wash
 * (the file cards' approved/rejected tint), and the left edge and the chip repeat the status. At the bottom, `PrReplyBox` holds the user's instruction or reply text.
 */
export function PrCommentCard({ thread, showLocation = false }: PrCommentCardProps) {
  const { root, replies } = thread
  const { resolution } = root
  const label = `${root.author.login}'s comment`
  const tint = PR_STATUS[root.status].tint
  return (
    <li
      data-pr-comment={root.id}
      data-status={root.status}
      aria-label={`GitHub comment ${root.id}, ${root.status}`}
      className={cn('relative flex flex-col gap-1.5 rounded-lg border-fine border-l-[3px] border-line bg-paper px-3 py-2 text-[13px]', PR_STATUS[root.status].edge)}
    >
      {tint && <div className={cn('pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-colors', tint)} data-pr-tint={root.status} aria-hidden />}
      <PrCommentMeta view={root} root showLocation={showLocation} />
      <PrCommentBody body={root.body} label={label} />
      {replies.length > 0 && (
        <ul aria-label={`Replies to ${label}`} className="flex flex-col gap-2 border-l-fine border-line pl-3">
          {replies.map((reply) => (
            <li key={reply.id} data-pr-reply={reply.id} className="flex flex-col gap-1">
              <PrCommentMeta view={reply} />
              <PrCommentBody body={reply.body} label={`${reply.author.login}'s reply`} />
            </li>
          ))}
        </ul>
      )}
      {resolution && (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-t-fine border-line pt-1.5 text-xs">
          <Bot aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 basis-48">
            <span className="font-bold">{resolution.status === 'addressed' ? 'Claude Code addressed it:' : 'Claude Code declined:'}</span> {resolution.note}
          </span>
          {resolution.commitSha && (
            <Tag size="sm" mono title={`Commit ${resolution.commitSha}`}>
              <GitCommitHorizontal aria-hidden />
              {shortSha(resolution.commitSha)}
            </Tag>
          )}
        </div>
      )}
      <PrReplyBox root={root} />
    </li>
  )
}
