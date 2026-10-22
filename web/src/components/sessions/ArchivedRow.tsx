import type { ArchivedSession } from '@review-dash/shared'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { formatRelativeTime } from '@/lib/format'
import { SessionIdentity } from './SessionIdentity'

interface ArchivedRowProps {
  session: ArchivedSession
  onUnarchive: (session: ArchivedSession) => void
  onDelete: (session: ArchivedSession) => void
}

export function ArchivedRow({ session, onUnarchive, onDelete }: ArchivedRowProps) {
  return (
    <li aria-label={`Archived session ${session.title}`}>
      <Panel className="flex-row flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0 basis-full lg:flex-1 lg:basis-64"><SessionIdentity title={session.title} tickets={session.tickets} repo={session.repo} /></div>
        <span className="text-xs text-ink-muted">Archived <time dateTime={session.archivedAt} title={session.archivedAt}>{formatRelativeTime(session.archivedAt)}</time></span>
        <span className="flex items-center gap-2">
          <Button size="sm" onClick={() => onUnarchive(session)} aria-label={`Restore ${session.title}`}><ArchiveRestore aria-hidden />Restore</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(session)} aria-label={`Delete ${session.title}`} title="Delete permanently" className="text-ink-muted hover:bg-red-solid hover:text-on-red"><Trash2 aria-hidden /></Button>
        </span>
      </Panel>
    </li>
  )
}
