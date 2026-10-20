import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A raised key cap: 22px, 1.5px line, 1px shadow. Inherits the sans font (not mono). */
function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-[22px] min-w-[22px] items-center justify-center gap-1 rounded-sm border-fine border-line bg-surface px-[5px] font-sans text-[11px] font-bold text-ink shadow-kbd select-none',
        'in-data-[slot=tooltip-content]:border-paper/40 in-data-[slot=tooltip-content]:bg-paper/15 in-data-[slot=tooltip-content]:text-paper in-data-[slot=tooltip-content]:shadow-none',
        '[&_svg:not([class*="size-"])]:size-3',
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="kbd-group" className={cn('inline-flex items-center gap-1', className)} {...props} />
}

export { Kbd, KbdGroup }
