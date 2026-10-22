import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { RailIdentity } from './RailIdentity'
import { RailReview } from './RailReview'
import { RailSlotOutlet } from './RailSlot'
import { useShellConfig } from './shell-config'
import { useSidebar } from './sidebar-context'
import { useCurrentSection } from './useCurrentSection'
import { useDrawerBehaviour } from './useDrawerBehaviour'
import { useRailDensity } from './useRailDensity'
import { useSessionSummary } from './useSessionSummary'

/** Sticky under the bar (`--shell-h`, see index.css). */
const BELOW_BAR = 'sticky top-(--shell-h) h-[calc(100dvh-var(--shell-h))]'

/**
 * The 296px rail beside every session page: the identity, the review state, then the block the
 * page puts in (`RailSection`). Sticky beside the content at 1024px and up; below that a left
 * drawer, opened and closed by the bar's toggle.
 */
export function SessionRail() {
  const { desktop, open, close } = useSidebar()
  const { sessionId } = useSessionContext()
  const { basePath } = useShellConfig()
  const section = useCurrentSection()
  const [density, toggleDensity] = useRailDensity(section === 'files' ? 'files' : 'other')
  const summary = useSessionSummary()
  const ref = useDrawerBehaviour(open && !desktop, close)
  if (!open) return null

  const panel = (
    <aside
      ref={ref}
      id="session-rail"
      aria-label="Session panel"
      tabIndex={-1}
      className={cn(
        'flex w-[296px] shrink-0 flex-col overflow-hidden border-r-fine border-line bg-paper-2 outline-none',
        desktop ? BELOW_BAR : 'absolute inset-y-0 left-0 max-w-[88vw] shadow-panel',
      )}
    >
      <RailIdentity density={density} onToggleDensity={toggleDensity} />
      <RailReview summary={summary} density={density} submitTo={`${basePath}/${encodeURIComponent(sessionId)}/submit`} />
      <RailSlotOutlet />
    </aside>
  )

  if (desktop) return panel
  return (
    <div className="fixed inset-x-0 top-(--shell-h) bottom-0 z-30">
      <button type="button" aria-label="Close sidebar" title="Close sidebar" onClick={close} className="absolute inset-0 bg-ink/30" />
      {panel}
    </div>
  )
}
