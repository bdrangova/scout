import type { Ticket } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TicketChipProps {
  ticket: Ticket
  className?: string
}

const chipClass =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-info/25 bg-info/10 px-2.5 font-mono text-xs font-semibold text-info'

/** The ticket key pill; a link (new tab) when the manifest has a URL. */
export function TicketChip({ ticket, className }: TicketChipProps) {
  if (ticket.url) {
    return (
      <a
        href={ticket.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(chipClass, 'transition hover:bg-info/15', className)}
      >
        {ticket.key}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    )
  }
  return (
    <span className={cn(chipClass, className)}>
      {ticket.key}
    </span>
  )
}
