import type { Ticket } from '@review-dash/shared'
import type { ReactNode } from 'react'
import { BranchPair, BranchRef, RepoRef } from '@/components/common/BranchRef'
import { TicketStrip } from '@/components/session/TicketStrip'

interface SessionIdentityProps {
  title: string
  tickets: readonly Ticket[]
  repo: { path: string; branch: string | null; baseRef: string | null }
  /** Extra meta after the branches: the branch-changed flag on live rows, the created time on archived ones. */
  children?: ReactNode
}

/** The first column of every row: ticket chips and the title, then the repo and its branches in mono. */
export function SessionIdentity({ title, tickets, repo, children }: SessionIdentityProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <TicketStrip tickets={tickets} className="max-w-[55%] shrink-0" />
        <span className="truncate text-[17px] font-bold tracking-[-.005em]" title={title}>
          {title}
        </span>
      </div>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs text-ink-muted">
        <RepoRef path={repo.path} className="shrink-0" />
        {repo.baseRef === null ? <BranchRef name={repo.branch} /> : <BranchPair baseRef={repo.baseRef} branch={repo.branch} />}
        {children}
      </span>
    </div>
  )
}
