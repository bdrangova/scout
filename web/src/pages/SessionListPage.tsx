import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ArchivedList } from '@/components/sessions/ArchivedList'
import { BrokenRow } from '@/components/sessions/BrokenRow'
import { SessionFilters } from '@/components/sessions/SessionFilters'
import { SessionListHead } from '@/components/sessions/SessionListHead'
import { EmptyState, ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionRow } from '@/components/sessions/SessionRow'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { TestRunRow } from '@/components/sessions/TestRunRow'
import { useSessionList } from '@/hooks/useSessionList'
import { otherKindRoute, type SessionKind } from '@/lib/paths'
import { isSessionSummary, isTestRunSummary } from '@/lib/session-status'
import { useHotkeys } from '@/lib/useHotkeys'

/** The Development list (code reviews, `/`) or of test runs (`/t`); `T` flips between them. */
export function SessionListPage({ kind = 'code-review' }: { kind?: SessionKind }) {
  const list = useSessionList(kind)
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  useHotkeys({ help: () => setHelpOpen((open) => !open), toggleKind: () => navigate(otherKindRoute(kind)) })

  return (
    <div data-page="session-list" className="flex min-h-screen flex-col">
      <SessionsBar kind={kind} onHelp={() => setHelpOpen(true)} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
            <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">{kind === 'test-run' ? 'Test runs' : 'Development'}</h1>
            <SessionFilters filter={list.filter} counts={list.counts} onFilter={list.setFilter} onToggleArchived={list.toggleArchived} />
          </div>

          {list.error ? (
            <ErrorState message={`Couldn't load the sessions: ${list.error.message}`} onRetry={list.reload} />
          ) : list.loading ? (
            <LoadingState />
          ) : list.filter === 'archived' ? (
            <ArchivedList items={list.archived} error={list.archivedError} onUnarchive={list.unarchive} onDeleted={list.hideArchived} reload={list.reloadArchived} />
          ) : list.items.length === 0 ? (
            <EmptyState kind={kind} />
          ) : (
            <div className="flex flex-col gap-2">
              <SessionListHead kind={kind} />
              <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                {list.visible.map((item) =>
                  isTestRunSummary(item) ? (
                    <TestRunRow key={item.id} session={item} onArchive={list.archive} />
                  ) : isSessionSummary(item) ? (
                    <SessionRow key={item.id} session={item} onArchive={list.archive} />
                  ) : (
                    <BrokenRow key={item.id} item={item} />
                  ),
                )}
                {list.visible.length === 0 && <ListNote>{kind === 'test-run' ? 'No test runs match this filter.' : 'No sessions match this filter.'}</ListNote>}
              </ul>
            </div>
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
