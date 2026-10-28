import { ScoutMark } from '@/components/brand/Scout'
import { BookOpen, Keyboard, Settings } from 'lucide-react'
import { useState } from 'react'
import { SkillsHelp } from '@/components/common/SkillsHelp'
import { HEADER_CHIP_CLASS, HEADER_INK_VARS } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useHotkeys } from '@/lib/useHotkeys'
import type { ListKind } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { SettingsDialog } from '@/components/worktrees/SettingsDialog'
import { SessionKindToggle } from './SessionKindToggle'

const ICON_CHIP = cn(HEADER_CHIP_CLASS, 'w-(--header-control-h) px-0')

/**
 * The bar of the sessions list: the session bar's height (`--shell-h`) and colour with the
 * wordmark and the Worktrees | Development | Test runs | PR reviews toggle where Sessions and the tabs will be, then the Skills (`?`), Shortcuts (Ctrl+?) and Settings icon buttons and the theme. No rail here.
 */
/** `onHelp` toggles the shortcuts help (button and Ctrl+?); `?` toggles Skills; `onSettingsSaved` runs after the Settings dialog saved. */
export function SessionsBar({ kind, onHelp, onSettingsSaved }: { kind: ListKind; onHelp: () => void; onSettingsSaved?: () => void }) {
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useHotkeys({ help: () => setSkillsOpen((open) => !open), altHelp: onHelp })
  return (
    <TooltipProvider delay={150}>
      <header
        data-slot="session-bar"
        className={cn('flex min-h-(--shell-h) flex-wrap items-center gap-3 border-b-fine border-line bg-hdr px-5 text-hdr-ink max-lg:px-3.5 py-2', HEADER_INK_VARS)}
      >
        <span className="flex shrink-0 items-center gap-2.5 text-xl font-bold tracking-[-.01em]"><ScoutMark className="size-9" />Scout</span>
        <div className="max-sm:order-last max-sm:basis-full"><SessionKindToggle kind={kind} /></div>
        <div className="ml-auto flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger render={<Button size="sm" aria-label="Skills" onClick={() => setSkillsOpen(true)} className={ICON_CHIP} />}>
              <BookOpen aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Skills
              <Kbd>?</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button size="sm" aria-label="Keyboard shortcuts" onClick={onHelp} className={ICON_CHIP} />}>
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
          <Tooltip>
            <TooltipTrigger render={<Button size="sm" aria-label="Settings" onClick={() => setSettingsOpen(true)} className={ICON_CHIP} />}>
              <Settings aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">Settings</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
      </header>
      <SkillsHelp open={skillsOpen} onOpenChange={setSkillsOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={onSettingsSaved} />
    </TooltipProvider>
  )
}
