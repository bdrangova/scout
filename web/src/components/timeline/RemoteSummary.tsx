import type { Remote } from '@review-dash/shared'
import { ArrowDown, ArrowUp, CloudOff } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { pluralize } from '@/lib/format'

/** The ahead/behind arrows at the right end of the strip (behind only when there is any), or a muted icon when the branch has no remote. */
export function RemoteSummary({ remote }: { remote: Remote }) {
  if (remote.ref === null) {
    const label = 'No remote branch: nothing has been pushed'
    return (
      <Tooltip>
        <TooltipTrigger render={<span role="img" aria-label={label} className="flex shrink-0 text-muted-foreground" />}>
          <CloudOff className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    )
  }
  const ahead = `${pluralize(remote.ahead, 'commit')} not on ${remote.ref}`
  const behind = `${pluralize(remote.behind, 'commit')} on ${remote.ref} not here`
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs tabular-nums">
      <span className={remote.ahead > 0 ? 'inline-flex items-center gap-0.5 text-warn-foreground' : 'inline-flex items-center gap-0.5 text-muted-foreground'} title={ahead} aria-label={ahead}>
        <ArrowUp className="size-3" aria-hidden />
        {remote.ahead}
      </span>
      {remote.behind > 0 && (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground" title={behind} aria-label={behind}>
          <ArrowDown className="size-3" aria-hidden />
          {remote.behind}
        </span>
      )}
    </span>
  )
}
