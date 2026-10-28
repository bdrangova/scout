import { anchorKey, type JournalEntry, type LineAnchor } from '@scout/shared'
import { ChevronDown, ChevronRight, MessageSquareReply } from 'lucide-react'
import { useState } from 'react'
import { JournalBody, KindChip } from '@/components/journal/JournalParts'
import { ScoutMark } from '@/components/brand/Scout'
import { Button } from '@/components/ui/button'
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
}

/** Scout's notes under a diff line: a raised panel apart from the reviewer's comments (Scout glyph, yellow edge). */
export function JournalAnnotation({ anchor, entries, collapsed, onReply }: JournalAnnotationProps) {
  return (
    <div className={cn(PANEL_CLASS, 'border-l-[3px] border-l-yellow')} data-journal-notes={anchorKey(anchor)}>
      {entries.map((entry) => (
        <JournalNoteRow key={entry.id} entry={entry} anchor={anchor} startCollapsed={collapsed} onReply={onReply} />
      ))}
    </div>
  )
}

function JournalNoteRow({ entry, anchor, startCollapsed, onReply }: { entry: JournalEntry; anchor: LineAnchor; startCollapsed: boolean; onReply?: JournalAnnotationProps['onReply'] }) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <section aria-label={`Scout note: ${entry.title}`} data-journal-id={entry.id} className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <ScoutMark className="size-5" />
        <KindChip kind={entry.kind} />
        <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="flex min-w-0 flex-1 items-center gap-1 text-left font-bold">
          <Chevron aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
          <span className="truncate">{entry.title}</span>
        </button>
        {onReply && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onReply(anchor, replyOf(entry))}>
            <MessageSquareReply aria-hidden className="size-3.5" />
            Reply
          </Button>
        )}
      </div>
      {!collapsed && <JournalBody entry={entry} />}
    </section>
  )
}
