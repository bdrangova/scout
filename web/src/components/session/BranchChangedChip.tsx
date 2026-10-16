import { TriangleAlert } from 'lucide-react'

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

/** Amber flag shown where a session's diff follows a checkout that moved to another branch. */
export function BranchChangedChip(props: BranchChangedChipProps) {
  if (!branchChanged(props)) return null
  return (
    <span
      role="status"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-warn-foreground"
      title={`The session was created on ${props.sessionBranch}; the repository is now on ${props.current}. The diff follows the checkout.`}
    >
      <TriangleAlert className="size-3.5" aria-hidden />
      Branch changed
      <span className="hidden xl:inline">
        {' · now on '}
        <span className="font-mono">{props.current}</span>
      </span>
    </span>
  )
}
