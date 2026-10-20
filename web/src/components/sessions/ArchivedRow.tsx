import type { ArchivedSession } from '@review-dash/shared'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatRelativeTime } from '@/lib/format'
import { SessionIdentity } from './SessionIdentity'

interface ArchivedRowProps {
  session: ArchivedSession
  onUnarchive: (session: ArchivedSession) => void
  onDelete: (session: ArchivedSession) => void
}

/** An archived session is not a link (there is nothing to open): only Unarchive and Delete. */
export function ArchivedRow({ session, onUnarchive, onDelete }: ArchivedRowProps) {
  return (
    <li aria-label={`Archived session ${session.title}`}>
      <Panel className="flex-row flex-wrap items-center gap-x-5 gap-y-3 bg-surface/70 px-5 py-4">
        <div className="min-w-0 basis-full lg:flex-1 lg:basis-64">
          <SessionIdentity title={session.title} tickets={session.tickets} repo={session.repo}>
            <span className="shrink-0 whitespace-nowrap">
              · created{' '}
              <time dateTime={session.createdAt} title={session.createdAt}>
                {formatRelativeTime(session.createdAt)}
              </time>
            </span>
          </SessionIdentity>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
          <Archive className="size-3.5" aria-hidden />
          Archived{' '}
          <time dateTime={session.archivedAt} title={session.archivedAt}>
            {formatRelativeTime(session.archivedAt)}
          </time>
        </span>
        <span className="flex items-center gap-2">
          <Button size="sm" onClick={() => onUnarchive(session)} aria-label={`Unarchive ${session.title}`}>
            <ArchiveRestore />
            Unarchive
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(session)} aria-label={`Delete ${session.title}`} title="Delete permanently" className="text-red hover:bg-red-solid hover:text-on-red">
            <Trash2 />
          </Button>
        </span>
      </Panel>
    </li>
  )
}
