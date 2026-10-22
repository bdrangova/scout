import { Keyboard } from 'lucide-react'
import { HEADER_CHIP_CLASS, HEADER_INK_VARS } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SessionKind } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { SessionKindToggle } from './SessionKindToggle'

/**
 * The bar of the sessions list: the session bar's height (`--shell-h`) and colour with the
 * wordmark and the Development | Test runs toggle where Sessions and the tabs will be, then Shortcuts and the theme. No rail here.
 */
export function SessionsBar({ kind, onHelp }: { kind: SessionKind; onHelp: () => void }) {
  return (
    <TooltipProvider delay={150}>
      <header
        data-slot="session-bar"
        className={cn('flex h-(--shell-h) items-center gap-3 border-b-fine border-line bg-hdr px-5 text-hdr-ink max-lg:px-3.5', HEADER_INK_VARS)}
      >
        <span className="text-xl font-bold tracking-[-.01em]">Review Dash</span>
        <SessionKindToggle kind={kind} />
        <div className="ml-auto flex items-center gap-3">
          <Button size="sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onHelp} className={HEADER_CHIP_CLASS}>
            <Keyboard aria-hidden />
            <span className="max-sm:sr-only">Shortcuts</span>
            <Kbd className="max-sm:hidden">?</Kbd>
          </Button>
          <ThemeToggle />
        </div>
      </header>
    </TooltipProvider>
  )
}
