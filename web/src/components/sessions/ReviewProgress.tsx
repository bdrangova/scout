import { CheckCheck } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface ReviewProgressProps {
  reviewed: number
  total: number
}

/** `✓✓ 1/12 ▬▬` — the row's reviewed count with a short track (coral, green once complete). */
export function ReviewProgress({ reviewed, total }: ReviewProgressProps) {
  const label = `Reviewed ${reviewed} of ${total}`
  return (
    <Progress
      value={reviewed}
      max={Math.max(total, 1)}
      aria-label={label}
      title={label}
      className="flex-nowrap gap-2 text-ink-muted [&_[data-slot=progress-track]]:h-3 [&_[data-slot=progress-track]]:w-14"
    >
      <CheckCheck className="size-[15px] shrink-0" aria-hidden />
      <span className="font-mono text-[12.5px] font-semibold tabular-nums">
        {reviewed}/{total}
      </span>
    </Progress>
  )
}
