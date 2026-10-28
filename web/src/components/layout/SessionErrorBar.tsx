import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { HEADER_CHIP_CLASS, HEADER_INK_VARS } from './AppHeader'

/**
 * The bar of a session that cannot be opened (archived, repository missing, a failed load):
 * Sessions and the session id; nothing else exists to show. Same height and colour as `SessionBar`.
 */
export function SessionErrorBar({ id }: { id: string }) {
  return (
    <header
      data-slot="session-bar"
      className={cn('flex h-(--shell-h) items-center gap-3 border-b-fine border-line bg-hdr px-5 text-hdr-ink max-lg:px-3.5', HEADER_INK_VARS)}
    >
      <Link to="/d" title="Sessions" className={cn(buttonVariants({ size: 'sm' }), HEADER_CHIP_CLASS, 'w-(--header-control-h) px-0')}>
        <ChevronLeft aria-hidden />
        <span className="sr-only">Sessions</span>
      </Link>
      <span className="min-w-0 truncate font-mono text-xs opacity-85" title={id}>
        {id}
      </span>
      <ThemeToggle className="ml-auto" />
    </header>
  )
}
