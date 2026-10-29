import type { PrCommentView, PrReplyKind } from '@scout/shared'
import { Check, ListChecks, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { CommentAction, CommentHeader, YouAvatar } from '@/components/common/CommentHeader'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { formatRelativeTime } from '@/lib/format'
import { hasReplyBox, isStaleDraft, replyKindFor } from '@/lib/pr-replies'
import { usePrComments } from '@/state/pr-comments-context'
import { bodyExcerpt } from './pr-format'
import { usePrReplyDraft, type ReplySaveStatus } from '@/state/usePrReplyDraft'

const STATUS_TEXT: Record<ReplySaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }

interface PrReplyBoxProps {
  root: PrCommentView
  /** The note is open for typing (its Edit, or the card's Reply); otherwise a saved note reads as text, and an empty one shows nothing. */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
}

/**
 * The user's note on one open or answered PR thread: an instruction for Claude on an open one (sent with the next
 * Submit, never posted), the agent's proposed reply on an answered one (an untouched proposal is not queued until
 * "Use this reply"), and a posted reply as a read-only quote. Replies inside a thread and outdated threads get none.
 */
export function PrReplyBox({ root, editing = false, onEditingChange = () => {} }: PrReplyBoxProps) {
  if (!hasReplyBox(root)) return null
  if (root.draftReply?.postedAt) return <PostedReply body={root.draftReply.body} postedAt={root.draftReply.postedAt} />
  if (root.draftReply && !editing && !isStaleDraft(root)) return <SavedNote root={root} body={root.draftReply.body} kind={root.draftReply.kind} onEdit={() => onEditingChange(true)} />
  return <ReplyEditor root={root} editing={editing} onEditingChange={onEditingChange} />
}

/**
 * A saved note, read-only, in the same box as the reviewer's own comments (caret, You, what it is, Queued, then
 * Edit / Delete; Delete removes only the note).
 */
function SavedNote({ root, body, kind, onEdit }: { root: PrCommentView; body: string; kind: PrReplyKind; onEdit: () => void }) {
  const { saveReply } = usePrComments()
  const [collapsed, setCollapsed] = useState(false)
  const what = kind === 'instruction' ? 'instruction' : 'reply'
  const author = root.author.login
  return (
    <div data-pr-reply-box={kind} data-queued="" className="border-t-fine border-line pt-1.5">
      <div className="flex flex-col gap-1.5 rounded-lg border-fine border-l-[3px] border-line border-l-ink bg-surface px-3 py-2 text-[13px]">
        <CommentHeader
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          avatar={<YouAvatar />}
          title="You"
          label={`your ${what} on ${author}'s comment`}
          badges={
            <>
              <Tag size="sm" title={kind === 'instruction' ? 'Sent to Claude with your next submit; never posted' : 'Posted to GitHub when you submit'}>
                {kind === 'instruction' ? 'Instruction for Claude' : 'Reply to post on GitHub'}
              </Tag>
              <Tag size="sm" tone="info" data-pr-queued>
                <ListChecks aria-hidden />
                Queued
              </Tag>
            </>
          }
          preview={bodyExcerpt(body)}
          actions={
            <>
              <CommentAction
                icon={Pencil}
                aria-label={`Edit your ${what} on ${author}'s comment`}
                onClick={onEdit}
              >
                Edit
              </CommentAction>
              <CommentAction icon={Trash2} className="hover:text-red" aria-label={`Delete your ${what} on ${author}'s comment`} onClick={() => void saveReply(root.id, '')}>
                Delete
              </CommentAction>
            </>
          }
        />
        {!collapsed && (
          <p aria-label={kind === 'instruction' ? `Your instruction about ${author}'s comment` : `Your reply to ${author}'s comment`} className="m-0 whitespace-pre-wrap">
            {body}
          </p>
        )}
      </div>
    </div>
  )
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

function ReplyEditor({ root, editing, onEditingChange }: { root: PrCommentView; editing: boolean; onEditingChange: (editing: boolean) => void }) {
  const { value, onChange, flush, accept, clear, mismatch, status } = usePrReplyDraft(root)
  const draft = root.draftReply ?? null
  const kind = draft?.kind ?? replyKindFor(root) ?? 'reply'
  const stale = isStaleDraft(root) || mismatch
  const isProposal = draft === null && Boolean(root.proposedReply)
  const author = root.author.login
  // The text when editing started: Cancel and Escape put it back.
  const originalRef = useRef(value)
  const composing = editing && !stale && !isProposal

  function save() {
    void flush().then((saved) => saved && onEditingChange(false))
  }

  function cancel() {
    if (value !== originalRef.current) onChange(originalRef.current)
    void flush().then(() => onEditingChange(false))
  }

  // Nothing to show until the card's Reply opens it.
  if (kind === 'instruction' && draft === null && value === '' && !editing) return null

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (composing) cancel()
      else event.currentTarget.blur()
    }
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
        autoFocus={editing}
        value={value}
        rows={2}
        aria-label={kind === 'instruction' ? `Instruction for Claude about ${author}'s comment` : `Reply to ${author}'s comment`}
        placeholder={kind === 'instruction' ? 'What should Claude do about this comment?' : 'Reply to post on GitHub…'}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={onKeyDown}
        className="min-h-14 resize-none rounded-lg text-[13px] leading-relaxed"
      />
      {composing && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-muted">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>{' '}
            to save · Esc to cancel
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={value.trim() === ''} onClick={save}>
              Comment
            </Button>
          </div>
        </div>
      )}
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
