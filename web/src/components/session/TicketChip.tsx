import type { Ticket } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

interface TicketChipsProps {
  tickets: readonly Ticket[]
  /** Sizing for the strip in its row (`max-w-*`, `shrink-*`); it is always `min-w-0`. */
  className?: string
}

/** Width of the fade over a clipped edge, in px. */
const FADE = 20

/**
 * The session's tickets on one line. When they do not fit, the strip scrolls sideways (no visible
 * scrollbar) and the clipped edge fades out; the neighbouring column is never overlapped.
 */
export function TicketChips({ tickets, className }: TicketChipsProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [clipped, setClipped] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setClipped((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, tickets])

  if (tickets.length === 0) return null
  const mask =
    clipped.start || clipped.end
      ? `linear-gradient(to right, ${clipped.start ? 'transparent' : 'black'}, black ${FADE}px, black calc(100% - ${FADE}px), ${clipped.end ? 'transparent' : 'black'})`
      : undefined
  return (
    <div
      ref={ref}
      onScroll={measure}
      className={cn('flex min-w-0 items-center gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {tickets.map((ticket) => (
        <TicketChip key={ticket.key} ticket={ticket} />
      ))}
    </div>
  )
}
