import type { Ticket } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { tagVariants } from '@/components/ui/tag'
import { cn } from '@/lib/utils'

interface TicketChipProps {
  ticket: Ticket
  className?: string
}

/** The design's `.ticket`: a blue mono tag, a little taller than a plain tag. */
const chipClass = cn(tagVariants({ tone: 'blue', mono: true }), 'h-[26px] shrink-0 rounded-md px-2.5 text-xs font-bold')
/** The ticket key chip; a link (new tab) when the manifest has a URL. */
export function TicketChip({ ticket, className }: TicketChipProps) {
  if (ticket.url) {
    return (
      <a
        href={ticket.url}
        target="_blank"
        rel="noreferrer"
        title={`Open ${ticket.key}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(chipClass, 'press hover:bg-yellow hover:text-on-yellow', className)}
      >
        {ticket.key}
        <ExternalLink aria-hidden />
      </a>
    )
  }
  return (
    <span data-slot="tag" className={cn(chipClass, className)}>
      {ticket.key}
    </span>
  )
}
