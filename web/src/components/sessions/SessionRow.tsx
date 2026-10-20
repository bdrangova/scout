import type { SessionSummary } from '@review-dash/shared'
import { Archive, ChevronRight } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { BranchChangedChip } from '@/components/session/BranchChangedChip'
import { DiffStats } from '@/components/session/DiffStats'
import { StatusPill } from '@/components/session/StatusPill'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatRelativeTime } from '@/lib/format'
import { sessionIndexRoute } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { SESSION_GRID, SESSION_META } from './grid'
import { ReviewProgress } from './ReviewProgress'
import { SessionIdentity } from './SessionIdentity'

interface SessionRowProps {
  session: SessionSummary
  onArchive: (session: SessionSummary) => void
}

/** A live session: the whole panel is a link to its files; Archive appears on hover or focus. */
export function SessionRow({ session, onArchive }: SessionRowProps) {
  const navigate = useNavigate()
  const href = sessionIndexRoute(session.id)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(href)
    }
  }

  // The row itself is the link: the button must not bubble its click (or Enter/Space) up to it.
  function onArchiveClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onArchive(session)
  }

  // Not an <a>: the ticket chip inside is its own link (opening in a new tab), and anchors
  // cannot nest. `role="link"` + tabIndex keep the row keyboard-accessible.
  return (
    <li>
      <Panel
        role="link"
        tabIndex={0}
        aria-label={session.title}
        data-href={href}
        onClick={() => navigate(href)}
        onKeyDown={onKeyDown}
        className={cn(
          SESSION_GRID,
          'group flex cursor-pointer flex-col gap-3 overflow-visible px-5 py-4 transition-[transform,background-color] duration-100',
          'hover:bg-paper-2 active:translate-[2px]',
        )}
      >
        <SessionIdentity title={session.title} tickets={session.tickets} repo={session.repo}>
          <BranchChangedChip sessionBranch={session.repo.sessionBranch} current={session.repo.branch} />
        </SessionIdentity>
        <div className={SESSION_META}>
          <DiffStats additions={session.stats.additions} deletions={session.stats.deletions} files={session.stats.files} />
          <ReviewProgress reviewed={session.progress.reviewed} total={session.progress.total} />
          <div>
            <StatusPill summary={session} showWord />
          </div>
          <time dateTime={session.updatedAt} title={`Updated ${formatRelativeTime(session.updatedAt)}`} className="text-[13px] font-medium text-ink-muted">
            {formatRelativeTime(session.updatedAt)}
          </time>
          <span className="ml-auto flex items-center gap-2 lg:ml-0 lg:justify-self-end">
            <Button
              size="icon-sm"
              aria-label={`Archive ${session.title}`}
              title="Archive session"
              onClick={onArchiveClick}
              onKeyDown={(event) => event.stopPropagation()}
              className="size-[30px] rounded-[9px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-yellow hover:text-on-yellow focus-visible:opacity-100 [&_svg]:size-[15px]"
            >
              <Archive />
            </Button>
            <ChevronRight className="size-[18px] text-ink-muted" aria-hidden />
          </span>
        </div>
      </Panel>
    </li>
  )
}
