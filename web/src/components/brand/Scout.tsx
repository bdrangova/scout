import { cn } from '@/lib/utils'

/** Decorative mark: the surrounding link or wordmark supplies its accessible name. */
export function ScoutMark({ className }: { className?: string }) {
  return <img src="/brand/scout-head.png" alt="" aria-hidden width={64} height={64} className={cn('scout-art size-8 shrink-0 object-contain', className)} />
}

/** Select the still before downloading an animation when reduced motion is requested. */
export function ScoutMascot({ mode = 'idle', className }: { mode?: 'idle' | 'working'; className?: string }) {
  return (
    <picture aria-hidden className={cn('block w-80 max-w-full shrink-0', className)}>
      <source media="(prefers-reduced-motion: reduce)" srcSet="/brand/scout-head.png" />
      <img src={`/brand/scout-${mode}.gif`} alt="" width={800} height={450} className="scout-art aspect-video w-full object-contain" />
    </picture>
  )
}
