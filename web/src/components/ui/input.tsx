import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Single-line sibling of `Textarea`; 34px tall like the design's filter box. */
function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-[34px] w-full min-w-0 rounded-lg border-fine border-line bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors outline-none placeholder:text-ink-muted',
        'focus-visible:border-focus focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 aria-invalid:border-err-bd',
        'file:border-0 file:bg-transparent file:text-sm file:font-semibold',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
