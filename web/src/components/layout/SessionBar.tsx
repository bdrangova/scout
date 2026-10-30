import { BookOpen, ChevronLeft, Keyboard } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { SkillsHelp } from '@/components/common/SkillsHelp'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { PAGE_MODES, SWIPE_GRID_MODES } from '@/lib/mode'
import { useHotkeys } from '@/lib/useHotkeys'
import { sessionListRoute } from '@/lib/paths'
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

const ICON_CHIP = cn(HEADER_CHIP_CLASS, 'w-(--header-control-h) px-0')

function submitState({ status }: Pick<ReturnType<typeof useSessionSummary>, 'status'>): SubmitState {
  return status === 'ready' ? 'ready' : null
}

/**
 * The 52px bar on top of every session page: the sidebar toggle, Sessions, the section tabs
 * with their counts, the Swipe/Grid switch (Files, or a test run's card pages; Scroll/Grid on Spec and Extras), Shortcuts, the theme and the overflow
 * menu. No identity and no status: those live in the rail. Its height is `--shell-h` (index.css).
 */
export function SessionBar({ onHelp }: SessionBarProps) {
  const [skillsOpen, setSkillsOpen] = useState(false)
  useHotkeys({ help: () => setSkillsOpen((open) => !open) })
  const { detail } = useSessionContext()
  const { kind } = useShellConfig()
  const listLabel = kind === 'test-run' ? 'Test runs' : kind === 'pr-review' ? 'PR reviews' : 'Sessions'
  const { saveStatus } = useReview()
  const summary = useSessionSummary()
  const { pathname } = useLocation()
  const section = useCurrentSection()
  const onModes = kind === 'test-run' ? ['review', 'gaps', 'logs', 'data-setup'].includes(section ?? '') : section === 'files'
  // A PR review's Evidence page has its own swipe and grid.
  const onPrEvidence = kind === 'pr-review' && section === 'evidence'
  // Spec, Extras and a PR review's Summary switch between their stacked cards and a grid of tiles, on their own route.
  const onPageModes = kind !== 'test-run' && (section === 'spec' || section === 'extras' || section === 'summary')
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
            render={<Link to={sessionListRoute(kind)} title={listLabel} className={cn(buttonVariants({ size: 'sm' }), ICON_CHIP, 'max-[520px]:hidden')} />}
          >
            <ChevronLeft aria-hidden />
            <span className="sr-only">{listLabel}</span>
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
          {onModes && <ModeToggle pathname={kind === 'test-run' ? pathname : undefined} />}
          {onPrEvidence && <ModeToggle pathname={pathname} modes={SWIPE_GRID_MODES} />}
          {onPageModes && <ModeToggle pathname={pathname} modes={PAGE_MODES} />}
          <Tooltip>
            <TooltipTrigger render={<Button size="sm" aria-label="Skills" onClick={() => setSkillsOpen(true)} className={cn(ICON_CHIP, 'max-lg:hidden')} />}>
              <BookOpen aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Skills
              <Kbd>?</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button size="sm" aria-label="Keyboard shortcuts" onClick={onHelp} className={cn(ICON_CHIP, 'max-lg:hidden')} />}>
              <Keyboard aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Keyboard shortcuts
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>?</Kbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
          <ThemeToggle className="max-lg:hidden" />
          <BarMenu onHelp={onHelp} onSkills={() => setSkillsOpen(true)} />
        </div>
      </header>
      <SkillsHelp open={skillsOpen} onOpenChange={setSkillsOpen} />
    </TooltipProvider>
  )
}
