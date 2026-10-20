import type { Ticket } from '@review-dash/shared'
import { useFadeScroll } from '@/components/common/useFadeScroll'
import { cn } from '@/lib/utils'
import { TicketChip } from './TicketChip'

interface TicketStripProps {
  tickets: readonly Ticket[]
  /** Sizing for the strip in its row (`max-w-*`, `shrink-*`); it is always `min-w-0`. */
  className?: string
}

/**
 * The session's tickets on one line. When they do not fit the strip scrolls sideways (wheel, trackpad, touch, keyboard; no visible scrollbar) and the
 * clipped edge fades out; the neighbouring column is never overlapped. A single ticket is just shown.
 */
export function TicketStrip({ tickets, className }: TicketStripProps) {
  const { ref, onScroll, style, scrollable } = useFadeScroll<HTMLDivElement>([tickets])

  if (tickets.length === 0) return null
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Tickets"
      tabIndex={scrollable ? 0 : undefined}
      onScroll={onScroll}
      className={cn('flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      style={style}
    >
      {tickets.map((ticket) => (
        <TicketChip key={ticket.key} ticket={ticket} />
      ))}
    </div>
  )
}
