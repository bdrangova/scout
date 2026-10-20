import type { ComponentProps } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface IconLinkProps extends ComponentProps<'a'> {
  /** The accessible name and the tooltip (`Open in Jira`). */
  label: string
  size?: 'icon' | 'icon-sm'
  /** Also show `label` as text from `lg` up (U4: an icon alone is not clear without a hover). */
  showLabel?: boolean
}

/** A square raised button (with its label beside the icon at `lg`+ when `showLabel`) that is really a link (`role=link`), opening in a new tab. */
export function IconLink({ label, size = 'icon-sm', showLabel = false, className, children, ...props }: IconLinkProps) {
  return (
    <a
      data-slot="icon-link"
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant: 'default', size }), showLabel && 'lg:w-auto lg:px-3 lg:text-[13px]', className)}
      {...props}
    >
      {children}
      {showLabel && <span className="hidden lg:inline">{label}</span>}
    </a>
  )
}
