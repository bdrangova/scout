import { MessageSquare } from 'lucide-react'

/** The open comments on a box's files, as a small chip; nothing at zero. */
export function CommentCount({ count }: { count: number }) {
  if (count === 0) return null
  const label = count === 1 ? '1 open comment' : `${count} open comments`
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center gap-1 rounded-full border-fine border-ink bg-ink px-1.5 py-px font-mono text-[10.5px] font-bold text-paper tabular-nums">
      <MessageSquare aria-hidden className="size-3 stroke-[2.5]" />
      {count}
    </span>
  )
}
