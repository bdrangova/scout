import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface EvidenceNavProps {
  /** Zero-based. */
  index: number
  total: number
  onGo: (delta: number) => void
}

/** The content header's "n / N" with previous and next buttons (the thumbnails live in the rail). */
export function EvidenceNav({ index, total, onGo }: EvidenceNavProps) {
  return (
    <span role="group" aria-label={`Item ${index + 1} of ${total}`} className="inline-flex items-center gap-1.5">
      <Button size="icon-sm" aria-label="Previous item" title="Previous item (←)" disabled={index === 0} onClick={() => onGo(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-[44px] text-center font-mono text-[13px] font-semibold text-ink tabular-nums">
        {index + 1} / {total}
      </span>
      <Button size="icon-sm" aria-label="Next item" title="Next item (→)" disabled={index >= total - 1} onClick={() => onGo(1)}>
        <ChevronRight aria-hidden />
      </Button>
    </span>
  )
}
