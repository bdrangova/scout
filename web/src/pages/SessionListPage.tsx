import { LiveSessionCard } from '@/components/sessions/SessionCards'
import { SESSION_CARD_GRID, useSessionListLayout } from '@/components/sessions/session-list-layout'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { otherKindRoute, type SessionKind } from '@/lib/paths'
import { TestRunRow } from '@/components/sessions/TestRunRow'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ArchivedList } from '@/components/sessions/ArchivedList'
import { BrokenRow } from '@/components/sessions/BrokenRow'
import { SessionFilters } from '@/components/sessions/SessionFilters'
import { EmptyState, ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionRow } from '@/components/sessions/SessionRow'
import { matchesSessionSearch } from '@/components/sessions/session-search'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { useSessionList } from '@/hooks/useSessionList'
import { isLiveSummary, isTestRunSummary } from '@/lib/session-status'
import { useHotkeys } from '@/lib/useHotkeys'

export function SessionListPage({ kind = 'code-review' }: { kind?: SessionKind }) {
  const list = useSessionList(kind)
  const { layout, setLayout } = useSessionListLayout()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  const archived = list.filter === 'archived'
  const visible = list.visible.filter((item) => matchesSessionSearch(item, query))
  const sessions = visible.filter(isLiveSummary)
  const unavailable = visible.filter((item) => !isLiveSummary(item))
  useHotkeys({ toggleKind: () => navigate(otherKindRoute(kind)) })

  return (
    <div data-page="session-list" className="flex min-h-screen flex-col">
      <SessionsBar kind={kind} onHelp={() => setHelpOpen((open) => !open)} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <div className="flex flex-col gap-5">
            <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">{archived ? 'Archived sessions' : kind === 'test-run' ? 'Test runs' : kind === 'pr-review' ? 'PR reviews' : 'Development'}</h1>
            <SessionFilters layout={layout} onLayout={setLayout} kind={kind} filter={list.filter} counts={list.counts} onFilter={list.setFilter} onToggleArchived={list.toggleArchived} query={query} onQuery={setQuery} />
          </div>

          {list.error ? (
            <ErrorState message={`Couldn't load the sessions: ${list.error.message}`} onRetry={list.reload} />
          ) : list.loading ? (
            <LoadingState archived={archived} kind={kind} />
          ) : archived ? (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-xs text-ink-muted">Restore an archived session to open it.</p>
              <ArchivedList
                kind={kind}
                layout={layout}
                items={list.archived.filter((item) => matchesSessionSearch(item, query))}
                emptyMessage={query.trim() ? 'No archived sessions match your search.' : undefined}
                error={list.archivedError}
                onUnarchive={list.unarchive}
                onDeleted={list.hideArchived}
                reload={list.reloadArchived}
              />
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState kind={kind} />
          ) : (
            <div className="flex flex-col gap-2">
              <ul aria-label="Sessions" className={cn('m-0 list-none p-0', layout === 'grid' ? SESSION_CARD_GRID : 'flex flex-col gap-3.5')}>
                {sessions.map((item) => layout === 'grid' ? <LiveSessionCard key={item.id} session={item} onArchive={list.archive} /> : isTestRunSummary(item) ? <TestRunRow key={item.id} session={item} onArchive={list.archive} /> : <SessionRow key={item.id} session={item} onArchive={list.archive} />)}
                {visible.length === 0 && <ListNote>{kind === 'test-run' ? 'No test runs match this filter or search.' : 'No sessions match this filter or search.'}</ListNote>}
              </ul>
              {unavailable.length > 0 && (
                <details className="mt-4 text-ink-muted">
                  <summary className="cursor-pointer text-xs font-medium">{unavailable.length} {unavailable.length === 1 ? 'session' : 'sessions'} unavailable</summary>
                  <p className="my-3 text-xs">Couldn't load these.</p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">{unavailable.map((item) => !isLiveSummary(item) && <BrokenRow key={item.id} item={item} />)}</ul>
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
