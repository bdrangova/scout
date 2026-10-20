import { TriangleAlert } from 'lucide-react'
import { Tag } from '@/components/ui/tag'

export interface BranchChangedChipProps {
  /** The branch the session was published on. */
  sessionBranch: string | null
  /** The branch checked out now. */
  current: string | null
}

/** True when the repository is on another branch than the session was published on. */
function branchChanged({ sessionBranch, current }: BranchChangedChipProps): boolean {
  return sessionBranch !== null && current !== null && sessionBranch !== current
}

/** Warning tag shown where a session's diff follows a checkout that moved to another branch. */
export function BranchChangedChip(props: BranchChangedChipProps) {
  if (!branchChanged(props)) return null
  return (
    <Tag
      tone="warn"
      role="status"
      aria-label={`Branch changed · now on ${props.current}`}
      className="shrink-0"
      title={`The session was created on ${props.sessionBranch}; the repository is now on ${props.current}. The diff follows the checkout.`}
    >
      <TriangleAlert aria-hidden />
      Branch changed
      <span className="hidden font-medium xl:inline">
        · now on <span className="font-mono">{props.current}</span>
      </span>
    </Tag>
  )
}
