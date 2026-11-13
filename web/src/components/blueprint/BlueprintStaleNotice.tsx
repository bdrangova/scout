import type { BlueprintGroupingType } from '@scout/shared'
import { Button } from '@/components/ui/button'
import { blueprintGroupsCommand } from '@/lib/blueprint'
import { pluralize } from '@/lib/format'
import { useCopyCommand } from './useCopyCommand'

export interface BlueprintStaleNoticeProps {
  sessionId: string
  type: BlueprintGroupingType
  /** Changed files no group names. */
  ungrouped: number
  /** Files the grouping names that left the change. */
  gone: number
}

/** One slim line above the canvas when the change moved on after the grouping was made, with a button that copies the command to group again. */
export function BlueprintStaleNotice({ sessionId, type, ungrouped, gone }: BlueprintStaleNoticeProps) {
  const { copied, failed, copy } = useCopyCommand(blueprintGroupsCommand(sessionId, type))
  const text = ungrouped > 0 ? `${pluralize(ungrouped, 'file')} changed since this grouping` : `${pluralize(gone, 'file')} left the change since this grouping`
  return (
    <div role="status" aria-label="Grouping is out of date" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b-fine border-line bg-warn-bg px-4 py-1.5 text-[12.5px] font-semibold text-ink md:px-6">
      <span>{text}</span>
      <Button size="sm" className="h-6" onClick={copy} title="Copy the command that asks the agent to group again">
        {copied ? 'Copied' : 'Regroup'}
      </Button>
      {failed && <span className="font-medium text-ink-muted">Could not copy; the command is /scout-blueprint-groups {sessionId} {type}</span>}
    </div>
  )
}
