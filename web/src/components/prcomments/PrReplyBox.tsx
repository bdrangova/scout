import type { PrCommentView } from '@scout/shared'
import { Check, ListChecks, MessageSquareText } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { formatRelativeTime } from '@/lib/format'
import { hasReplyBox, isStaleDraft, replyKindFor } from '@/lib/pr-replies'
import { usePrReplyDraft, type ReplySaveStatus } from '@/state/usePrReplyDraft'

const STATUS_TEXT: Record<ReplySaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }

/**
 * The editable text of one open or answered PR thread: an instruction for Claude on an open one (sent with the next
 * Submit, never posted), the agent's proposed reply on an answered one (an untouched proposal is not queued until
 * "Use this reply"), and a posted reply as a read-only quote. Replies inside a thread and outdated threads get none.
 */
export function PrReplyBox({ root }: { root: PrCommentView }) {
  if (!hasReplyBox(root)) return null
  if (root.draftReply?.postedAt) return <PostedReply body={root.draftReply.body} postedAt={root.draftReply.postedAt} />
  return <ReplyEditor root={root} />
}

function PostedReply({ body, postedAt }: { body: string; postedAt: string }) {
  return (
    <div data-pr-reply-box="posted" className="flex flex-col gap-1 border-t-fine border-line pt-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Tag size="sm" tone="ok">
          <Check aria-hidden />
          Posted to GitHub
        </Tag>
        <time dateTime={postedAt} title={postedAt} className="text-[11px] text-ink-muted">
          {formatRelativeTime(postedAt)}
        </time>
      </div>
      <blockquote aria-label="Posted reply" className="m-0 whitespace-pre-wrap border-l-fine border-line pl-3 text-[13px] text-ink">
        {body}
      </blockquote>
    </div>
  )
}

function ReplyEditor({ root }: { root: PrCommentView }) {
  const { value, onChange, flush, accept, clear, mismatch, status } = usePrReplyDraft(root)
  const [opened, setOpened] = useState(false)
  const draft = root.draftReply ?? null
  const kind = draft?.kind ?? replyKindFor(root) ?? 'reply'
  const stale = isStaleDraft(root) || mismatch
  const isProposal = draft === null && Boolean(root.proposedReply)
  const author = root.author.login

  if (kind === 'instruction' && draft === null && value === '' && !opened) {
    return (
      <div data-pr-reply-box="instruction" className="border-t-fine border-line pt-1.5">
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-label={`Instruction for Claude about ${author}'s comment`}
          className="flex min-h-[34px] w-full items-center gap-2 rounded-lg border-fine border-dashed border-line bg-paper px-3 text-left text-[13px] font-medium text-ink-muted transition-colors hover:border-solid hover:bg-paper-2 hover:text-ink"
        >
          <MessageSquareText aria-hidden className="size-3.5 shrink-0" />
          Tell Claude what to do…
        </button>
      </div>
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.currentTarget.blur()
  }

  const title = stale
    ? kind === 'instruction'
      ? 'Instruction for Claude · not sent'
      : 'Reply · not posted'
    : kind === 'instruction' ? 'Instruction for Claude · sent with your next submit' : isProposal ? 'Proposed reply from Claude' : 'Reply to post on GitHub · posted when you submit'
  const hint = isProposal ? 'Not queued yet · use it to post it when you submit' : null
  return (
    <div data-pr-reply-box={kind} data-queued={draft !== null && !stale ? '' : undefined} data-stale={stale ? '' : undefined} className="flex flex-col gap-1.5 border-t-fine border-line pt-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-bold">{title}</span>
        {draft !== null && !stale && (
          <Tag size="sm" tone="info" data-pr-queued>
            <ListChecks aria-hidden />
            Queued
          </Tag>
        )}
        <span className="ml-auto min-h-4 text-[11px] font-medium text-ink-muted" aria-live="polite">
          {STATUS_TEXT[status]}
        </span>
      </div>
      <Textarea
        autoFocus={opened}
        value={value}
        rows={2}
        aria-label={kind === 'instruction' ? `Instruction for Claude about ${author}'s comment` : `Reply to ${author}'s comment`}
        placeholder={kind === 'instruction' ? 'What should Claude do about this comment?' : 'Reply to post on GitHub…'}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={onKeyDown}
        className="min-h-14 resize-none rounded-lg text-[13px] leading-relaxed"
      />
      {stale && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-muted">
            {kind === 'instruction'
              ? 'This comment changed since you wrote this instruction. It was not posted. Clear it to use the proposed reply.'
              : 'This comment changed since you wrote this reply. It was not posted. Clear it to write an instruction.'}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => void clear()}>
            Clear
          </Button>
        </div>
      )}
      {isProposal && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-muted">{hint}</span>
          <Button size="sm" className="ml-auto" onClick={() => void accept()}>
            Use this reply
          </Button>
        </div>
      )}
    </div>
  )
}
