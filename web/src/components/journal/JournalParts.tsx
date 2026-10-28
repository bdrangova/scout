import type { JournalEntry, JournalKind } from '@scout/shared'
import { X } from 'lucide-react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { Markdown } from '@/components/common/Markdown'
import { Tag } from '@/components/ui/tag'
import { KIND_LABEL, KIND_TONE, type JournalReply } from '@/lib/journal-view'

export function KindChip({ kind }: { kind: JournalKind }) {
  return (
    <Tag tone={KIND_TONE[kind]} size="sm" data-journal-kind={kind}>
      {KIND_LABEL[kind]}
    </Tag>
  )
}

/** The note's markdown and, when it recorded rejected options, a small "Considered" list. */
export function JournalBody({ entry }: { entry: JournalEntry }) {
  return (
    <div className="flex flex-col gap-2">
      {entry.body.trim() !== '' && <Markdown source={entry.body} className="text-[13px]" />}
      {entry.alternatives && entry.alternatives.length > 0 && (
        <div className="flex flex-col gap-1" data-journal-alternatives>
          <Eyebrow>Considered</Eyebrow>
          <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
            {entry.alternatives.map((alternative) => (
              <li key={alternative.option}>
                <span className="font-semibold">{alternative.option}</span>
                <span className="text-ink-muted">: {alternative.whyNot}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The "Replying to Scout · <title>" quote above a reply's text box. */
export function ReplyChip({ reply, onCancel }: { reply: JournalReply; onCancel?: () => void }) {
  return (
    <p data-journal-reply={reply.id} className="m-0 flex min-w-0 items-center gap-1.5 rounded-md border-fine border-line bg-paper-2 px-2 py-1 text-xs font-semibold text-ink-muted">
      <span className="truncate">
        Replying to Scout · <span className="text-ink">{reply.title}</span>
      </span>
      {onCancel && (
        <button type="button" aria-label="Stop replying to this note" title="Stop replying" onClick={onCancel} className="ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-hover">
          <X aria-hidden className="size-3" />
        </button>
      )}
    </p>
  )
}
