import type { ComponentProps, ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme/ThemeToggle'

/** The band's `--header-control-h` square icon control (tickets share it) (`.icon-btn`): chip fill, ink line, hover turns yellow. */
export const HEADER_ICON_CLASS = 'size-(--header-control-h) rounded-(--header-control-r) bg-hdr-chip text-hdr-ink shadow-icon hover:bg-yellow hover:text-on-yellow'

/** The same chip with a label beside the icon (Sessions, Shortcuts): use it on a `size="sm"` button, it only sets the height, radius and colours. */
export const HEADER_CHIP_CLASS = 'h-(--header-control-h) rounded-(--header-control-r) bg-hdr-chip text-hdr-ink shadow-icon hover:bg-yellow hover:text-on-yellow'

/** Lines and shadows inside a header are derived from `--hdr-ink`, so chips stay inked on both fills (yellow in light, blue in dark). */
export const HEADER_INK_VARS = '[--line:color-mix(in_srgb,var(--hdr-ink)_34%,transparent)] [--sh:color-mix(in_srgb,var(--hdr-ink)_20%,transparent)]'

/** `HEADER_ICON_CLASS` as a `Button`. Needs `aria-label` + `title`. For a link, put the class on the `Link` itself. */
export function HeaderIconButton({ className, ...props }: ButtonProps) {
  return <Button size="icon-sm" className={cn(HEADER_ICON_CLASS, className)} {...props} />
}

export interface AppHeaderProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** The left slot: the brand on the sessions list, the back link on a session. */
  leading?: ReactNode
  /** The middle: title block, tickets… Grows to fill the band. */
  children?: ReactNode
  /** The right slot, before the theme toggle. */
  trailing?: ReactNode
  /** Render as `<header>` (the page's banner). Default: a `div`, for a page that has its own `<header>`. */
  banner?: boolean
}

/**
 * The poster band at the top of every page: yellow in light, blue in dark (`bg-hdr`), 68px
 * (`min-h-hdr`), ink lines even in dark mode. The theme toggle always sits at its right end.
 * Lines and shadows inside it are derived from `--hdr-ink`, so chips stay inked on both fills.
 */
export function AppHeader({ leading, children, trailing, banner = false, className, ...props }: AppHeaderProps) {
  const Tag = banner ? 'header' : 'div'
  return (
    <Tag
      data-slot="app-header"
      className={cn(
        'min-h-hdr items-center flex flex-wrap gap-3 border-b-fine border-line bg-hdr px-5 py-2.5 text-hdr-ink',
        HEADER_INK_VARS,
        className,
      )}
      {...props}
    >
      {leading}
      {children}
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
        {trailing}
        <ThemeToggle />
      </div>
    </Tag>
  )
}
