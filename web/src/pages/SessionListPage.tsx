import { useState } from 'react'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ArchivedList } from '@/components/sessions/ArchivedList'
import { BrokenRow } from '@/components/sessions/BrokenRow'
import { SessionFilters } from '@/components/sessions/SessionFilters'
import { SessionListHead } from '@/components/sessions/SessionListHead'
import { EmptyState, ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionRow } from '@/components/sessions/SessionRow'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { useSessionList } from '@/hooks/useSessionList'
import { isSessionSummary } from '@/lib/session-status'
import { useHotkeys } from '@/lib/useHotkeys'

export function SessionListPage() {
  const list = useSessionList()
  const [helpOpen, setHelpOpen] = useState(false)
  useHotkeys({ help: () => setHelpOpen((open) => !open) })

  return (
    <div className="flex min-h-screen flex-col">
      <SessionsBar onHelp={() => setHelpOpen(true)} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
            <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">Review sessions</h1>
            <SessionFilters filter={list.filter} counts={list.counts} onFilter={list.setFilter} onToggleArchived={list.toggleArchived} />
          </div>

          {list.error ? (
            <ErrorState message={`Couldn't load the sessions: ${list.error.message}`} onRetry={list.reload} />
          ) : list.loading ? (
            <LoadingState />
          ) : list.filter === 'archived' ? (
            <ArchivedList items={list.archived} error={list.archivedError} onUnarchive={list.unarchive} onDeleted={list.hideArchived} reload={list.reloadArchived} />
          ) : list.items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              <SessionListHead />
              <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                {list.visible.map((item) =>
                  isSessionSummary(item) ? <SessionRow key={item.id} session={item} onArchive={list.archive} /> : <BrokenRow key={item.id} item={item} />,
                )}
                {list.visible.length === 0 && <ListNote>No sessions match this filter.</ListNote>}
              </ul>
            </div>
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
