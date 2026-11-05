import type { JournalEntry } from '@scout/shared'
import { ChevronDown, ChevronRight, MessageSquareReply } from 'lucide-react'
import { useState } from 'react'
import { ScoutIcon } from '@/components/brand/Scout'
import { Markdown } from '@/components/common/Markdown'
import { Button } from '@/components/ui/button'
import { entryAnchorLabel, replyOf, type JournalReply } from '@/lib/journal-view'
import { useJournalStripCollapsed } from '@/lib/journal-prefs'
import { pluralize } from '@/lib/format'
import { JournalBody, KindChip } from './JournalParts'

interface ScoutNotesStripProps {
  sessionId: string
  /** The file's live summary. */
  summary: JournalEntry | null
  /** The file's other notes the diff does not show under a line: file-level ones and those whose line moved or went. */
  others: readonly JournalEntry[]
  /** Absent where the card cannot take comments: no Reply button then. */
  onReply?: (reply: JournalReply) => void
}

/** "Scout's notes" under a card's header: the file's summary and a count of its other notes; folded state is remembered per session. */
export function ScoutNotesStrip({ sessionId, summary, others, onReply }: ScoutNotesStripProps) {
  const [collapsed, toggleCollapsed] = useJournalStripCollapsed(sessionId)
  const [showOthers, setShowOthers] = useState(false)
  if (summary === null && others.length === 0) return null
  const Chevron = collapsed ? ChevronRight : ChevronDown
  const listed = summary === null || showOthers
  return (
    <section aria-label="Scout's notes" data-journal-strip className="flex shrink-0 flex-col gap-2 border-b-fine border-line bg-paper-2/60 px-4 py-2 font-sans text-[13px]">
      <div className="flex items-center gap-2">
        <ScoutIcon className="size-5" />
        <button type="button" aria-expanded={!collapsed} onClick={toggleCollapsed} className="flex items-center gap-1 text-[13px] font-bold">
          <Chevron aria-hidden className="size-3.5 text-ink-muted" />
          Scout's notes
        </button>
        {summary !== null && others.length > 0 && (
          <button type="button" aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)} className="text-xs font-semibold text-focus underline underline-offset-2">
            +{pluralize(others.length, 'note')}
          </button>
        )}
      </div>
      {!collapsed && summary !== null && <Markdown source={summary.body} className="text-[13px]" />}
      {!collapsed && listed && others.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {others.map((entry) => (
            <li key={entry.id} data-journal-id={entry.id} className="flex flex-col gap-1.5 rounded-lg border-fine border-line bg-surface px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <KindChip kind={entry.kind} />
                <span className="min-w-0 flex-1 truncate font-bold">{entry.title}</span>
                {entry.anchor && <span className="text-xs font-semibold text-ink-muted italic">{entryAnchorLabel(entry)} moved or removed</span>}
                {onReply && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onReply(replyOf(entry))}>
                    <MessageSquareReply aria-hidden className="size-3.5" />
                    Reply
                  </Button>
                )}
              </div>
              <JournalBody entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
