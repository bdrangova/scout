import { useState } from 'react'
import { Outlet } from 'react-router'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { RailSlotProvider } from './RailSlot'
import { SessionBar } from './SessionBar'
import { SessionHotkeys } from './SessionHotkeys'
import { SessionLiveUpdates } from './SessionLiveUpdates'
import { SessionRail } from './SessionRail'
import { SidebarProvider } from './SidebarProvider'
import { SkipLink } from './SkipLink'

/**
 * The frame of every session page: the sticky bar on top, then the rail beside the page
 * (`Outlet`), plus the session-wide hotkeys and the shortcut help. Needs the session and review contexts.
 */
export function SessionShell() {
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <SidebarProvider>
      <RailSlotProvider>
        <div className="flex min-h-screen flex-col">
          <SkipLink />
          <SessionBar onHelp={() => setHelpOpen(true)} />
          <SessionLiveUpdates />
          <div className="flex flex-1">
            <SessionRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </div>
        <SessionHotkeys onToggleHelp={() => setHelpOpen((open) => !open)} />
        <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      </RailSlotProvider>
    </SidebarProvider>
  )
}
