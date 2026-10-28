import { Link } from 'react-router'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ListKind } from '@/lib/paths'

const KINDS: readonly { kind: ListKind; label: string; to: string }[] = [
  { kind: 'worktrees', label: 'Worktrees', to: '/' },
  { kind: 'code-review', label: 'Development', to: '/d' },
  { kind: 'test-run', label: 'Test runs', to: '/t' },
  { kind: 'pr-review', label: 'PR reviews', to: '/pr' },
]

/**
 * Worktrees | Development | Test runs | PR reviews, as a flat chooser of links (`Segmented` look, like `ModeToggle`) between the lists.
 * `T` toggles it (bound by the page). Needs a `TooltipProvider`.
 */
export function SessionKindToggle({ kind }: { kind: ListKind }) {
  return (
    <Segmented aria-label="Session type" data-slot="kind-toggle">
      {KINDS.map((candidate) => {
        const active = candidate.kind === kind
        return (
          <Tooltip key={candidate.kind}>
            <TooltipTrigger
              render={
                <Link
                  to={candidate.to}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex h-[26px] items-center justify-center rounded-sm px-[11px] text-[12.5px] font-bold text-ink transition-colors hover:bg-hover',
                    'aria-[current=true]:bg-selected aria-[current=true]:text-on-selected aria-[current=true]:hover:bg-selected',
                  )}
                />
              }
            >
              {candidate.label}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {candidate.label}
              {!active && <Kbd>T</Kbd>}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </Segmented>
  )
}
