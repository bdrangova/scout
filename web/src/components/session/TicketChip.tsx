import type { Ticket } from '@review-dash/shared'
import { ExternalLink, Ticket as TicketIcon } from 'lucide-react'
import { tagVariants } from '@/components/ui/tag'
import { cn } from '@/lib/utils'

interface TicketChipProps {
  ticket: Ticket
  className?: string
  quiet?: boolean
}

/** The design's `.ticket`: a blue mono tag, a little taller than a plain tag. */
const chipClass = cn(tagVariants({ tone: 'blue', mono: true }), 'h-[26px] shrink-0 rounded-md px-2.5 text-xs font-bold')
/** The ticket key chip; a link (new tab) when the manifest has a URL. */
export function TicketChip({ ticket, className, quiet = false }: TicketChipProps) {
  if (ticket.url) {
    return (
      <a
        href={ticket.url}
        target="_blank"
        rel="noreferrer"
        title={`Open ${ticket.key}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(quiet ? 'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[11px] font-medium text-info-bd underline-offset-4 hover:bg-hover hover:underline focus-visible:bg-hover focus-visible:underline' : cn(chipClass, 'press cursor-pointer underline-offset-4 hover:bg-yellow hover:text-on-yellow hover:underline focus-visible:underline'), className)}
      >
        {quiet && <TicketIcon aria-hidden className="size-3.5 shrink-0" />}
        {ticket.key}
        {!quiet && <ExternalLink aria-hidden />}
      </a>
    )
  }
  return (
    <span data-slot="tag" className={cn(quiet ? 'inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium text-info-bd' : chipClass, className)}>
      {quiet && <TicketIcon aria-hidden className="size-3.5 shrink-0" />}
      {ticket.key}
    </span>
  )
}
