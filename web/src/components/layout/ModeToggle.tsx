import type { Mode } from '@scout/shared'
import { GalleryHorizontal, LayoutGrid, Rows3, type LucideIcon } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MODE_LABELS, MODE_PARAM, modeSearch, parseMode, parseRunMode } from '@/lib/mode'
import { sessionFilesRoute, testRunRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { useShellConfig } from './shell-config'

const MODE_ICONS: Record<Mode, LucideIcon> = { scroll: Rows3, swipe: GalleryHorizontal, grid: LayoutGrid }

/** The hotkey the tooltip shows: `S` flips swipe/scroll, `G` opens the grid. */
const MODE_KEYS: Record<Mode, string> = { scroll: 'S', swipe: 'S', grid: 'G' }

// scroll is hidden for now, still reachable via ?mode=scroll (re-enable by adding 'scroll' back here)
const VISIBLE_MODES: readonly Mode[] = ['swipe', 'grid']

/**
 * Swipe | Grid as a flat chooser (icons below `xl`, icons and words from `xl`) (`Segmented` look, links inside). Writes `?mode=`
 * on the files route (keeping the current file and the commit scope when already there); in a test run on the review
 * route (keeping the current scenario; `?mode=scroll` reads as swipe), or on `pathname` when the page (Gaps, Logs, Data
 * setup, from the session header) names its own. Needs a `TooltipProvider`.
 */
export function ModeToggle({ pathname: fixedPathname }: { pathname?: string } = {}) {
  const { sessionId } = useSessionContext()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const testRun = useShellConfig().kind === 'test-run'
  const mode = testRun ? parseRunMode(searchParams.get(MODE_PARAM)) : parseMode(searchParams.get(MODE_PARAM))
  const base = testRun ? testRunRoute(sessionId, 'review') : sessionFilesRoute(sessionId)
  const pathname = fixedPathname ?? (location.pathname.startsWith(base) ? location.pathname : base)

  return (
    <Segmented aria-label="Review mode" data-slot="mode-toggle">
      {VISIBLE_MODES.map((candidate) => {
        const active = candidate === mode
        const Icon = MODE_ICONS[candidate]
        return (
          <Tooltip key={candidate}>
            <TooltipTrigger
              render={
                <Link
                  to={{ pathname, search: modeSearch(searchParams, candidate) }}
                  replace
                  aria-label={MODE_LABELS[candidate]}
                  title={MODE_LABELS[candidate]}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex h-[26px] items-center justify-center gap-1.5 rounded-sm px-[9px] text-[12.5px] font-bold text-ink xl:px-[11px] transition-colors hover:bg-hover',
                    'aria-[current=true]:bg-selected aria-[current=true]:text-on-selected aria-[current=true]:hover:bg-selected',
                  )}
                />
              }
            >
              <Icon className="size-[15px]" aria-hidden />
              <span aria-hidden className="hidden xl:inline">
                {MODE_LABELS[candidate]}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {MODE_LABELS[candidate]}
              <Kbd>{MODE_KEYS[candidate]}</Kbd>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </Segmented>
  )
}
