interface ReviewProgressProps { reviewed: number; total: number; unit?: 'files' | 'scenarios' }

/** A single readable line, with no empty or duplicate progress decoration. */
export function ReviewProgress({ reviewed, total, unit = 'files' }: ReviewProgressProps) {
  return <span aria-label={`Reviewed ${reviewed} of ${total}`} className="text-xs text-ink-muted tabular-nums">{reviewed} of {total} {unit} reviewed</span>
}
