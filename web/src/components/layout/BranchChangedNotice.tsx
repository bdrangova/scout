import { GitBranch } from 'lucide-react'
import { Notice } from '@/components/ui/notice'

interface BranchChangedNoticeProps {
  /** The branch the session was published on. */
  sessionBranch: string | null
  /** The branch checked out now. */
  current: string | null
}

/** A warn notice in the status bar when the repository moved to another branch than the session was published on. */
export function BranchChangedNotice({ sessionBranch, current }: BranchChangedNoticeProps) {
  if (sessionBranch === null || current === null || sessionBranch === current) return null
  return (
    <Notice
      tone="warn"
      icon={<GitBranch />}
      className="min-w-0"
      title={`The session was created on ${sessionBranch}; the repository is now on ${current}. The diff follows the checkout.`}
    >
      <span className="whitespace-nowrap">Branch changed</span>
      <span className="hidden min-w-0 truncate font-mono font-medium xl:inline">{current}</span>
    </Notice>
  )
}
