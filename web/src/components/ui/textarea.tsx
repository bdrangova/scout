import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Paper field inside a fine line; grows with its content. */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-[84px] w-full resize-y rounded-xl border-fine border-line bg-paper px-3 py-2.5 text-sm leading-[1.45] text-ink transition-colors outline-none placeholder:text-ink-muted',
        'focus-visible:border-focus focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 aria-invalid:border-err-bd',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
