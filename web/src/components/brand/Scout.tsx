import { cn } from '@/lib/utils'

/** Decorative mark: the surrounding link or wordmark supplies its accessible name. */
export function ScoutMark({ className }: { className?: string }) {
  return <img src="/brand/scout-head.png" alt="" aria-hidden width={64} height={64} className={cn('scout-art size-8 shrink-0 object-contain', className)} />
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
