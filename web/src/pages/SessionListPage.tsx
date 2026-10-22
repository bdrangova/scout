import { useState } from 'react'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ArchivedList } from '@/components/sessions/ArchivedList'
import { BrokenRow } from '@/components/sessions/BrokenRow'
import { SessionFilters } from '@/components/sessions/SessionFilters'
import { SessionListHead } from '@/components/sessions/SessionListHead'
import { EmptyState, ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionRow } from '@/components/sessions/SessionRow'
import { matchesSessionSearch } from '@/components/sessions/session-search'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { useSessionList } from '@/hooks/useSessionList'
import { isSessionSummary } from '@/lib/session-status'
import { useHotkeys } from '@/lib/useHotkeys'

export function SessionListPage() {
  const list = useSessionList()
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  const archived = list.filter === 'archived'
  const visible = list.visible.filter((item) => matchesSessionSearch(item, query))
  const sessions = visible.filter(isSessionSummary)
  const unavailable = visible.filter((item) => !isSessionSummary(item))
  useHotkeys({ help: () => setHelpOpen((open) => !open) })

  return (
    <div className="flex min-h-screen flex-col">
      <SessionsBar onHelp={() => setHelpOpen(true)} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <div className="flex flex-col gap-5">
            <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">{archived ? 'Archived sessions' : 'Review sessions'}</h1>
            <SessionFilters filter={list.filter} counts={list.counts} onFilter={list.setFilter} onToggleArchived={list.toggleArchived} query={query} onQuery={setQuery} />
          </div>

          {list.error ? (
            <ErrorState message={`Couldn't load the sessions: ${list.error.message}`} onRetry={list.reload} />
          ) : list.loading ? (
            <LoadingState archived={archived} />
          ) : archived ? (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-xs text-ink-muted">Archived sessions are kept here. Restore a session to open it again.</p>
              <ArchivedList
                items={list.archived.filter((item) => matchesSessionSearch(item, query))}
                emptyMessage={query.trim() ? 'No archived sessions match your search.' : undefined}
                error={list.archivedError}
                onUnarchive={list.unarchive}
                onDeleted={list.hideArchived}
                reload={list.reloadArchived}
              />
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.length > 0 && <SessionListHead />}
              <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                {sessions.map((item) => <SessionRow key={item.id} session={item} onArchive={list.archive} />)}
                {visible.length === 0 && <ListNote>No sessions match this filter or search.</ListNote>}
              </ul>
              {unavailable.length > 0 && (
                <details className="mt-4 text-ink-muted">
                  <summary className="cursor-pointer text-xs font-medium">{unavailable.length} {unavailable.length === 1 ? 'session' : 'sessions'} unavailable</summary>
                  <p className="my-3 text-xs">These sessions could not be loaded. Their details are available below.</p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">{unavailable.map((item) => !isSessionSummary(item) && <BrokenRow key={item.id} item={item} />)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
