import type { PrCommentView } from '@review-dash/shared'
import { Bot } from 'lucide-react'
import { Tag } from '@/components/ui/tag'

const MARKER: Record<PrCommentView['author']['kind'], string | null> = { copilot: 'Copilot', bot: 'Bot', human: null }

/** The author's avatar (a bot icon, or the login's initials for a person), name and, for a bot or Copilot, a marker. */
export function PrAuthor({ author }: { author: PrCommentView['author'] }) {
  const marker = MARKER[author.kind]
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        title={author.kind === 'human' ? 'Person' : marker ?? undefined}
        className="flex size-5 shrink-0 items-center justify-center rounded-full border-fine border-fill-line bg-blue text-[9px] font-bold text-on-blue"
      >
        {author.kind === 'human' ? author.login.slice(0, 2).toUpperCase() : <Bot className="size-3" />}
      </span>
      <span className="min-w-0 truncate font-bold">{author.login}</span>
      {marker ? (
        <Tag size="sm" mono>
          {marker}
        </Tag>
      ) : (
        <span className="sr-only">(person)</span>
      )}
    </span>
  )
}
