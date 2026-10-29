import { Bot, CircleCheck, ExternalLink, GitCommitHorizontal, MessageSquareReply, RotateCcw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { CommentAction, CommentHeader } from '@/components/common/CommentHeader'
import { buttonVariants } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { replyKindFor } from '@/lib/pr-replies'
import type { PrThread } from '@/lib/pr-threads'
import { cn } from '@/lib/utils'
import { usePrComments } from '@/state/pr-comments-context'
import { bodyExcerpt, prLocationLabel } from './pr-format'
import { PR_STATUS, shortSha } from './pr-status'
import { PrAuthorMarker, PrAvatar } from './PrAuthor'
import { PrCommentBody } from './PrCommentBody'
import { PrReplyBox } from './PrReplyBox'
import { PrStatusChip } from './PrStatusChip'

export interface PrCommentCardProps {
  thread: PrThread
  /** Name where the comment is, for a comment outside the diff (the footer group). */
  showLocation?: boolean
}

/**
 * One GitHub review thread: the shared comment header (caret, avatar, author, badges, then Reply, Resolve / Reopen and
 * the GitHub link; Reply opens the note for Claude under the comment), the root's body, the replies under it, Claude's answer with its commit, and the user's note for Claude
 * (`PrReplyBox`, with its own Edit / Delete). One box; the side edge carries the status, and an addressed or declined
 * thread gets a green or red wash. "Resolve" only marks the thread handled in Scout: nothing reaches GitHub.
 */
export function PrCommentCard({ thread, showLocation = false }: PrCommentCardProps) {
  const { root, replies } = thread
  const { resolution } = root
  const { setResolved } = usePrComments()
  const label = `${root.author.login}'s comment`
  const tint = PR_STATUS[root.status].tint
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const location = showLocation ? prLocationLabel(root) : null
  // An open thread without a note yet: Reply opens one, like the other comments.
  const canReply = !root.isReply && replyKindFor(root) === 'instruction' && root.draftReply == null && !editing
  return (
    <li
      data-pr-comment={root.id}
      data-status={root.status}
      aria-label={`GitHub comment ${root.id}, ${root.status}`}
      className={cn('relative flex flex-col gap-1.5 rounded-lg border-fine border-l-[3px] border-line bg-surface px-3 py-2 text-[13px]', PR_STATUS[root.status].edge)}
    >
      {tint && <div className={cn('pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-colors', tint)} data-pr-tint={root.status} aria-hidden />}
      <CommentHeader
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        avatar={<PrAvatar author={root.author} />}
        title={root.author.login}
        label={label}
        badges={
          <>
            <PrAuthorMarker author={root.author} />
            <PrStatusChip view={root} />
            {!root.trusted && (
              <Tag size="sm" tone="warn" title="Untrusted author: text not sent to agent">
                <ShieldAlert aria-hidden />
                Not sent to agent
              </Tag>
            )}
            {location && (
              <Tag size="sm" mono>
                {location}
              </Tag>
            )}
          </>
        }
        preview={`${bodyExcerpt(root.body)}${replies.length > 0 ? ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}`}
        actions={
          <>
            {canReply && (
              <CommentAction
                icon={MessageSquareReply}
                aria-label={`Reply to ${label}`}
                onClick={() => {
                  setCollapsed(false)
                  setEditing(true)
                }}
              >
                Reply
              </CommentAction>
            )}
            {root.status === 'open' && (
              <CommentAction icon={CircleCheck} className="hover:text-green" aria-label={`Resolve ${label} in Scout`} title="Mark handled in Scout; nothing is posted to GitHub" onClick={() => void setResolved(root.id, true)}>
                Resolve
              </CommentAction>
            )}
            {root.closedBy === 'scout-resolved' && (
              <CommentAction icon={RotateCcw} aria-label={`Reopen ${label}`} onClick={() => void setResolved(root.id, false)}>
                Reopen
              </CommentAction>
            )}
            <a
              href={root.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${root.author.login}'s comment on GitHub`}
              title="View on GitHub"
              className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'h-6 px-1.5 text-xs')}
            >
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </>
        }
      />
      {!collapsed && (
        <>
          <PrCommentBody body={root.body} label={label} />
          {replies.length > 0 && (
            <ul aria-label={`Replies to ${label}`} className="flex flex-col gap-2 border-l-fine border-line pl-3">
              {replies.map((reply) => (
                <li key={reply.id} data-pr-reply={reply.id} className="flex flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <PrAvatar author={reply.author} />
                    <span className="min-w-0 truncate font-bold">{reply.author.login}</span>
                    <PrAuthorMarker author={reply.author} />
                  </span>
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
          <PrReplyBox root={root} editing={editing} onEditingChange={setEditing} />
        </>
      )}
    </li>
  )
}
