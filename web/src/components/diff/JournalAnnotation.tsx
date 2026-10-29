import { anchorKey, type JournalEntry, type LineAnchor } from '@scout/shared'
import { MessageSquareReply } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { JournalBody, KindChip } from '@/components/journal/JournalParts'
import { ScoutMark } from '@/components/brand/Scout'
import { CommentAction, CommentHeader } from '@/components/common/CommentHeader'
import { replyOf, type JournalReply } from '@/lib/journal-view'
import { cn } from '@/lib/utils'
import { PANEL_CLASS } from './LineAnnotation'

interface JournalAnnotationProps {
  anchor: LineAnchor
  entries: JournalEntry[]
  /** A file with more than 3 notes starts them folded to their titles. */
  collapsed: boolean
  /** Absent where the diff cannot take comments: no Reply button then. */
  onReply?: (anchor: LineAnchor, reply: JournalReply) => void
  /** The note being replied to and the reply box, shown under that note like a GitHub comment's note. */
  replying?: { id: string; box: ReactNode } | null
  /** The reviewer's saved replies to a note, shown under it. */
  repliesFor?: (id: string) => ReactNode
}

/** Scout's notes under a diff line: a raised panel apart from the reviewer's comments (Scout glyph, yellow edge). */
export function JournalAnnotation({ anchor, entries, collapsed, onReply, replying = null, repliesFor }: JournalAnnotationProps) {
  return (
    <div className={cn(PANEL_CLASS, 'border-l-[3px] border-l-yellow')} data-journal-notes={anchorKey(anchor)}>
      {entries.map((entry) => (
        <JournalNoteRow key={entry.id} entry={entry} anchor={anchor} startCollapsed={collapsed} onReply={onReply} replyBox={replying?.id === entry.id ? replying.box : null} replies={repliesFor?.(entry.id) ?? null} />
      ))}
    </div>
  )
}

function JournalNoteRow({ entry, anchor, startCollapsed, onReply, replyBox, replies }: { entry: JournalEntry; anchor: LineAnchor; startCollapsed: boolean; onReply?: JournalAnnotationProps['onReply']; replyBox: ReactNode; replies: ReactNode }) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  return (
    <section aria-label={`Scout note: ${entry.title}`} data-journal-id={entry.id} className="flex flex-col gap-1.5">
      <CommentHeader
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        avatar={<ScoutMark className="size-5" />}
        title={entry.title}
        label={entry.title}
        badges={<KindChip kind={entry.kind} />}
        actions={
          onReply &&
          !replyBox && (
            <CommentAction icon={MessageSquareReply} onClick={() => onReply(anchor, replyOf(entry))}>
              Reply
            </CommentAction>
          )
        }
      />
      {!collapsed && <JournalBody entry={entry} />}
      {!collapsed && replies && <div className="border-t-fine border-line pt-1.5">{replies}</div>}
      {replyBox && <div className="border-t-fine border-line pt-1.5">{replyBox}</div>}
    </section>
  )
}
