import type { PrCommentView } from '@scout/shared'
import { Bot } from 'lucide-react'
import { Tag } from '@/components/ui/tag'

type Author = PrCommentView['author']

const MARKER: Record<Author['kind'], string | null> = { copilot: 'Copilot', bot: 'Bot', human: null }

/** The author's avatar: a bot icon, or the login's initials for a person. */
export function PrAvatar({ author }: { author: Author }) {
  return (
    <span
      aria-hidden
      title={author.kind === 'human' ? 'Person' : MARKER[author.kind] ?? undefined}
      className="flex size-5 shrink-0 items-center justify-center rounded-full border-fine border-fill-line bg-blue text-[9px] font-bold text-on-blue"
    >
      {author.kind === 'human' ? author.login.slice(0, 2).toUpperCase() : <Bot className="size-3" />}
    </span>
  )
}

/** "Copilot" or "Bot" next to such an author's name; a person gets none (said for screen readers). */
export function PrAuthorMarker({ author }: { author: Author }) {
  const marker = MARKER[author.kind]
  return marker ? (
    <Tag size="sm" mono>
      {marker}
    </Tag>
  ) : (
    <span className="sr-only">(person)</span>
  )
}
