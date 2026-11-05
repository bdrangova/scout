import { cn } from '@/lib/utils'

/** Decorative mark: the surrounding link or wordmark supplies its accessible name. */
export function ScoutMark({ className }: { className?: string }) {
  return <img src="/brand/scout-head.png" alt="" aria-hidden width={64} height={64} className={cn('scout-art size-8 shrink-0 object-contain', className)} />
}

/** Small-size mark for Scout's notes: the favicon reads better than the detailed head at icon sizes. */
export function ScoutIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-block size-5 shrink-0', className)}>
      <img src="/brand/scout-favicon.svg" alt="" className="size-full dark:hidden" />
      <img src="/brand/scout-favicon-dark.svg" alt="" className="hidden size-full dark:block" />
    </span>
  )
}

/** Select the still before downloading an animation when reduced motion is requested. */
export function ScoutMascot({ mode = 'idle', className }: { mode?: 'idle' | 'working' | 'ready'; className?: string }) {
  return (
    <picture aria-hidden className={cn('block max-w-full shrink-0', mode === 'ready' ? 'w-64' : 'w-80', className)}>
      <source media="(prefers-reduced-motion: reduce)" srcSet={mode === 'ready' ? '/brand/scout-ready-still.png' : '/brand/scout-head.png'} />
      {mode !== 'ready' && <source type="image/webp" srcSet={`/brand/scout-${mode}.webp`} />}
      <img src={`/brand/scout-${mode}.${mode === 'ready' ? 'webp' : 'gif'}`} alt="" width={800} height={450} className="scout-art aspect-video w-full object-contain" />
    </picture>
  )
}
