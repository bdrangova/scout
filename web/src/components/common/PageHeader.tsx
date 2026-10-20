import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps extends Omit<ComponentProps<'header'>, 'title'> {
  /** The page name: `Spec`, `Extras`, `Evidence`. */
  title: ReactNode
  /** The 13px muted line after the title: counts, sources, open comments. */
  summary?: ReactNode
  /** Right-aligned keyboard hints (`<Kbd>` groups). */
  hint?: ReactNode
}

/**
 * The `.page-h` of the designs: a 26px title with the summary on its baseline and the keyboard
 * hints pushed right. Wraps on narrow widths.
 */
export function PageHeader({ title, summary, hint, className, children, ...props }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-2', className)} {...props}>
      <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">{title}</h1>
      {summary && <span className="flex min-w-0 flex-wrap items-center gap-3 text-[13px] font-medium text-ink-muted">{summary}</span>}
      {children}
      {hint && <span className="ml-auto flex items-center gap-3.5 text-xs font-semibold text-ink-muted">{hint}</span>}
    </header>
  )
}
