import type { Mode } from '@review-dash/shared'
import { GalleryHorizontal, LayoutGrid, Rows3, type LucideIcon } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MODE_LABELS, MODE_PARAM, MODES, modeSearch, parseMode } from '@/lib/mode'
import { sessionRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'

const MODE_ICONS: Record<Mode, LucideIcon> = { scroll: Rows3, swipe: GalleryHorizontal, grid: LayoutGrid }

/** The hotkey the tooltip shows: `S` flips swipe/scroll, `G` opens the grid. */
const MODE_KEYS: Record<Mode, string> = { scroll: 'S', swipe: 'S', grid: 'G' }

/**
 * Scroll | Swipe | Grid as an icon-only segmented control. Writes `?mode=` on the files route
 * (keeping the current file and the commit scope when already there). Needs a `TooltipProvider`.
 */
export function ModeToggle() {
  const { sessionId } = useSessionContext()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const mode = parseMode(searchParams.get(MODE_PARAM))
  const filesBase = sessionRoute(sessionId)
  const pathname = location.pathname.startsWith(filesBase) ? location.pathname : filesBase

  return (
    <div role="group" aria-label="Review mode" className="flex gap-0.5 rounded-lg bg-background p-0.75">
      {MODES.map((candidate) => {
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
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md transition outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                />
              }
            >
              <Icon className="size-4" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {MODE_LABELS[candidate]}
              <Kbd>{MODE_KEYS[candidate]}</Kbd>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
