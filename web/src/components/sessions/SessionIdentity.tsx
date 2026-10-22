import type { Ticket } from '@review-dash/shared'
import { Folder, GitBranch } from 'lucide-react'
import type { ReactNode } from 'react'
import { repoName } from '@/lib/paths'
import { TicketStrip } from '@/components/session/TicketStrip'

interface SessionIdentityProps {
  title: string
  tickets: readonly Ticket[]
  repo: { path: string; branch: string | null; baseRef: string | null }
  children?: ReactNode
}

/** Title first; ticket, repository and current branch are quiet context below it. */
export function SessionIdentity({ title, tickets, repo, children }: SessionIdentityProps) {
  const prefix = tickets.find((ticket) => title.startsWith(`${ticket.key}: `))
  const displayTitle = prefix ? title.slice(prefix.key.length + 2) : title
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="truncate text-base font-bold tracking-[-.005em]" title={title}>{displayTitle}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <TicketStrip tickets={tickets} quiet className="max-w-full" />
        <span title={`Repository: ${repo.path}`} aria-label={`Repository ${repoName(repo.path)}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-(--tk-n)"><Folder aria-hidden className="size-3.5 shrink-0" /><span className="truncate">{repoName(repo.path)}</span></span>
        <span className="inline-flex min-w-0 max-w-56 items-center gap-1.5 font-mono text-[11px] text-(--tk-t)" title={repo.baseRef ? `${repo.branch ?? 'detached HEAD'} → ${repo.baseRef}` : repo.branch ?? 'Detached HEAD'} aria-label={`Branch ${repo.branch ?? 'detached HEAD'} from ${repo.baseRef ?? 'working tree'}`}><GitBranch aria-hidden className="size-3.5 shrink-0" /><span className="truncate">{repo.branch ?? 'detached HEAD'}</span></span>
        {children}
      </div>
    </div>
  )
}
