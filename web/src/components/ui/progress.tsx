import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { cn } from '@/lib/utils'

/** A 14px track inside a fine line; the fill is neutral ink until complete, then green (coral read as an error while a review was merely under way). */
function Progress({ className, children, value, max = 100, ...props }: ProgressPrimitive.Root.Props) {
  const complete = value !== null && value !== undefined && value >= max
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      data-slot="progress"
      data-complete={complete || undefined}
      className={cn('group/progress flex flex-wrap items-center gap-2.5', className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn('relative flex h-3.5 w-[110px] items-center overflow-hidden rounded-full border-fine border-line bg-surface', className)}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn('h-full bg-ink transition-[width] group-data-complete/progress:bg-green', className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return <ProgressPrimitive.Label className={cn('text-[12.5px] font-semibold text-ink-muted', className)} data-slot="progress-label" {...props} />
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn('text-[12.5px] font-semibold text-ink-muted tabular-nums', className)}
      data-slot="progress-value"
      {...props}
    />
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
