import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useReview } from '@/state/review-context'
import { HeaderIconButton } from './AppHeader'
import { useSidebar } from './sidebar-context'

/**
 * The bar's leftmost control, on every session page and at every width: hides and shows the rail
 * (at 1024px and up) or opens it as a drawer (below). While the rail is closed it wears the
 * review progress, so the number the rail would show is never out of sight.
 */
export function SidebarToggle() {
  const { open, toggle } = useSidebar()
  const { progress } = useReview()
  const label = open ? 'Hide sidebar' : 'Show sidebar'
  const Icon = open ? PanelLeftClose : PanelLeftOpen
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <HeaderIconButton
            aria-label={label}
            title={`${label} (B)`}
            aria-expanded={open}
            aria-controls="session-rail"
            onClick={toggle}
            className="relative overflow-visible max-lg:aria-expanded:bg-hdr-ink max-lg:aria-expanded:text-hdr-chip"
          />
        }
      >
        <Icon aria-hidden />
        {!open && (
          <span
            title={`Reviewed ${progress.reviewed} of ${progress.total}`}
            className="absolute -top-[7px] -right-[9px] z-10 inline-grid h-[18px] place-items-center rounded-full border-fine border-hdr bg-ink px-1.5 text-[10.5px] font-bold text-paper tabular-nums"
          >
            {progress.reviewed}/{progress.total}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <Kbd>B</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
