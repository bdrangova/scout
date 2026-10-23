import type { ArchivedSession } from '@review-dash/shared'
import { useState } from 'react'
import type { SessionKind } from '@/lib/paths'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useDeleteArchived } from '@/lib/useDeleteArchived'
import { ArchivedSessionCard } from './SessionCards'
import { SESSION_CARD_GRID, type SessionListLayout } from './session-list-layout'
import { cn } from '@/lib/utils'
import { ArchivedRow } from './ArchivedRow'
import { ErrorState, ListNote } from './SessionListStates'

interface ArchivedListProps {
  kind?: SessionKind
  layout?: SessionListLayout
  emptyMessage?: string
  items: readonly ArchivedSession[]
  error: Error | null
  onUnarchive: (session: ArchivedSession) => void
  /** Hides the row at once; the archived list is refetched right after. */
  onDeleted: (id: string) => void
  reload: () => void
}

/** The Archived view: unarchive in place, or delete for good behind a confirmation. */
export function ArchivedList({ kind, layout = 'list', items, error, onUnarchive, onDeleted, reload, emptyMessage }: ArchivedListProps) {
  const [toDelete, setToDelete] = useState<ArchivedSession | null>(null)
  const deletion = useDeleteArchived((id) => {
    onDeleted(id)
    reload()
  })

  function openDelete(session: ArchivedSession) {
    deletion.reset()
    setToDelete(session)
  }
  async function confirmDelete() {
    if (toDelete === null) return
    if (await deletion.remove(toDelete.id)) setToDelete(null)
  }

  if (error) return <ErrorState message={`Couldn't load the archived sessions: ${error.message}`} onRetry={reload} />
  return (
    <ul aria-label="Archived sessions" className={cn('m-0 list-none p-0', layout === 'grid' ? SESSION_CARD_GRID : 'flex flex-col gap-3.5')}>
      {items.map((session) => (
        layout === 'grid' ? <ArchivedSessionCard kind={kind} key={session.id} session={session} onRestore={onUnarchive} onDelete={openDelete} /> : <ArchivedRow kind={kind} key={session.id} session={session} onUnarchive={onUnarchive} onDelete={openDelete} />
      ))}
      {items.length === 0 && <ListNote>{emptyMessage ?? 'No archived sessions.'}</ListNote>}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Delete this session permanently?"
        description={
          <>
            <span className="mb-1 block font-bold text-ink">{toDelete?.title}</span>
            Removes its review state, comments and run logs from disk; the repository is not touched. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        onConfirm={confirmDelete}
        pending={deletion.pending}
        error={deletion.error}
      />
    </ul>
  )
}
