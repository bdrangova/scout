import { ChevronLeft, Keyboard } from 'lucide-react'
import { Link } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { HEADER_CHIP_CLASS, HEADER_INK_VARS } from './AppHeader'
import { BarMenu } from './BarMenu'
import { ModeToggle } from './ModeToggle'
import { SectionTabs, type SubmitState } from './SectionTabs'
import { useShellConfig } from './shell-config'
import { SidebarToggle } from './SidebarToggle'
import { useCurrentSection } from './useCurrentSection'
import { useSessionSummary } from './useSessionSummary'

export interface SessionBarProps {
  /** Opens the keyboard shortcut help. */
  onHelp: () => void
}

function submitState({ status, run }: Pick<ReturnType<typeof useSessionSummary>, 'status' | 'run'>): SubmitState {
  if (run === 'failed') return 'failed'
  return status === 'ready' ? 'ready' : null
}

/**
 * The 52px bar on top of every session page: the sidebar toggle, Sessions, the section tabs
 * with their counts, the Swipe/Grid switch (Files, or a test run's Review), Shortcuts, the theme and the overflow
 * menu. No identity and no status: those live in the rail. Its height is `--shell-h` (index.css).
 */
export function SessionBar({ onHelp }: SessionBarProps) {
  const { detail } = useSessionContext()
  const { kind } = useShellConfig()
  const listLabel = kind === 'test-run' ? 'Test runs' : 'Sessions'
  const { saveStatus } = useReview()
  const summary = useSessionSummary()
  // The Swipe | Grid switch: the code review's Files page, the test run's Review page.
  const onModes = useCurrentSection() === (kind === 'test-run' ? 'review' : 'files')
  const saveText = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Not saved' : ''

  return (
    <TooltipProvider delay={150}>
      <header
        data-slot="session-bar"
        className={cn(
          'sticky top-0 z-20 flex h-(--shell-h) items-center gap-3 border-b-fine border-line bg-hdr px-5 text-hdr-ink max-lg:gap-2.5 max-lg:px-3.5 max-[520px]:gap-2 max-[520px]:px-3',
          HEADER_INK_VARS,
        )}
      >
        <SidebarToggle />
        <Tooltip>
          <TooltipTrigger
            render={<Link to={kind === 'test-run' ? '/t' : '/'} title={listLabel} className={cn(buttonVariants({ size: 'sm' }), HEADER_CHIP_CLASS, 'max-xl:w-(--header-control-h) max-xl:px-0 max-[520px]:hidden')} />}
          >
            <ChevronLeft aria-hidden />
            <span className="max-xl:sr-only">{listLabel}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{listLabel}</TooltipContent>
        </Tooltip>
        <SectionTabs detail={detail} submit={{ openComments: summary.openComments, state: submitState(summary) }} />
        <div className="ml-auto flex items-center gap-3 max-lg:gap-2.5">
          <span className="sr-only" aria-live="polite">
            {saveText}
          </span>
          {saveText && (
            <span aria-hidden className="text-xs font-semibold whitespace-nowrap max-[520px]:hidden">
              {saveText}
            </span>
          )}
          {onModes && <ModeToggle />}
          <Tooltip>
            <TooltipTrigger
              render={<Button size="sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onHelp} className={cn(HEADER_CHIP_CLASS, 'max-lg:hidden')} />}
            >
              <Keyboard aria-hidden />
              <span className="max-xl:sr-only">Shortcuts</span>
              <Kbd className="max-xl:hidden">?</Kbd>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Keyboard shortcuts
              <Kbd>?</Kbd>
            </TooltipContent>
          </Tooltip>
          <ThemeToggle className="max-lg:hidden" />
          <BarMenu onHelp={onHelp} />
        </div>
      </header>
    </TooltipProvider>
  )
}
