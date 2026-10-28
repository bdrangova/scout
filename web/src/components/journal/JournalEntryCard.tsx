import type { JournalEntry } from '@scout/shared'
import { MessageSquareReply } from 'lucide-react'
import { CommentBox } from '@/components/common/CommentBox'
import { Button } from '@/components/ui/button'
import { entryAnchorLabel, replyOf } from '@/lib/journal-view'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { JournalBody, KindChip, ReplyChip } from './JournalParts'

interface JournalEntryCardProps {
  entry: JournalEntry
  /** The file is in the diff: its name is a link that opens it at the note's line. */
  fileLinked: boolean
  onOpenFile: (entry: JournalEntry) => void
  /** The title of the replacement of a superseded note (jumps to it). */
  replacement: JournalEntry | null
  onShowEntry: (id: string) => void
  replying: boolean
  onReply: (entry: JournalEntry) => void
  onCancelReply: () => void
  onSubmitReply: (entry: JournalEntry, body: string) => void
}

/** One note on the Journal page: kind, title, body, alternatives, where it sits and a Reply. */
export function JournalEntryCard({ entry, fileLinked, onOpenFile, replacement, onShowEntry, replying, onReply, onCancelReply, onSubmitReply }: JournalEntryCardProps) {
  const superseded = entry.supersededBy !== undefined
  const line = entryAnchorLabel(entry)
  return (
    <article id={`journal-${entry.id}`} aria-label={entry.title} data-journal-id={entry.id} data-superseded={superseded || undefined} className="flex scroll-mt-20 flex-col gap-2 rounded-2xl border-fine border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindChip kind={entry.kind} />
        <h3 className={cn('m-0 min-w-0 flex-1 text-[15px] font-bold', superseded && 'text-ink-muted line-through')}>{entry.title}</h3>
        {entry.createdAt && <time dateTime={entry.createdAt} className="text-xs font-medium text-ink-muted">{formatRelativeTime(entry.createdAt)}</time>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-muted">
        <span className="font-mono">{entry.id}</span>
        {entry.file === null ? (
          <span>Session-level</span>
        ) : fileLinked ? (
          <button type="button" onClick={() => onOpenFile(entry)} className="font-mono text-focus underline underline-offset-2" aria-label={`Open ${entry.file}${line ? ` at ${line}` : ''}`}>
            {entry.file}{entry.anchor ? `:${entry.anchor.line}` : ''}
          </button>
        ) : (
          <span className="font-mono">{entry.file}{entry.anchor ? `:${entry.anchor.line}` : ''}</span>
        )}
        {replacement && (
          <button type="button" onClick={() => onShowEntry(replacement.id)} className="text-focus underline underline-offset-2">
            Superseded by {replacement.id}: {replacement.title}
          </button>
        )}
      </div>
      <div className={cn(superseded && 'opacity-70')}>
        <JournalBody entry={entry} />
      </div>
      {replying ? (
        <div className="flex flex-col gap-2">
          <ReplyChip reply={replyOf(entry)} onCancel={onCancelReply} />
          <CommentBox label={`Reply to ${entry.title}`} pendingReject={false} focusToken={1} onSubmit={(body) => onSubmitReply(entry, body)} onCancelReject={() => {}} onCancel={onCancelReply} />
        </div>
      ) : (
        <div>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onReply(entry)}>
            <MessageSquareReply aria-hidden className="size-3.5" />
            Reply
          </Button>
        </div>
      )}
    </article>
  )
}
