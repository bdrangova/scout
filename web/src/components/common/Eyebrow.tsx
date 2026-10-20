import type { ComponentProps, ElementType } from 'react'
import { cn } from '@/lib/utils'

type EyebrowProps<T extends ElementType> = { as?: T } & Omit<ComponentProps<T>, 'as'>

/** The small uppercase label above a group: shortcut groups, comment sections, before/after captions. */
export function Eyebrow<T extends ElementType = 'span'>({ as, className, ...props }: EyebrowProps<T>) {
  const Tag: ElementType = as ?? 'span'
  return <Tag data-slot="eyebrow" className={cn('m-0 text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase', className)} {...props} />
}
