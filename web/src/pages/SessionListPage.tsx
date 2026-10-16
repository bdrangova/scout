import type { ArchivedSession, SessionListItem, SessionSummary } from '@review-dash/shared'
import { Archive, ArchiveRestore, ChevronRight, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { KeyboardEvent, MouseEvent } from 'react'
import { toast } from 'sonner'
import { BranchPair, BranchRef } from '@/components/common/BranchRef'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DiffStats } from '@/components/session/DiffStats'
import { StatusPill } from '@/components/session/StatusPill'
import { TicketChip } from '@/components/session/TicketChip'
import { Button } from '@/components/ui/button'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'
import { formatRelativeTime } from '@/lib/format'
import { useArchivedSessions, useSessionList } from '@/lib/hooks'
import { repoName, sessionRoute } from '@/lib/paths'
import { STATUS_FILTERS, countByFilter, isSessionSummary, matchesFilter, type StatusFilter } from '@/lib/session-status'
import { useDeleteArchived } from '@/lib/useDeleteArchived'
import { useHiddenIds } from '@/lib/useHiddenIds'
import { useStoreEvents } from '@/lib/useStoreEvents'
import { cn } from '@/lib/utils'

/** Store events are coalesced for this long before the list is refetched. */
export const LIST_REFRESH_DEBOUNCE_MS = 300

// Below `lg` each row stacks (title, repo line, wrapped meta row); at `lg` and up it is a grid whose
// first column takes the leftover width so titles stay readable.
const GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_160px_72px_200px_96px_24px] lg:items-center lg:gap-x-5'
/** Wraps the meta cells so they flow below `lg` and dissolve into grid items at `lg`. */
const META = 'flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents'
/** The status chips; Archived is another dimension and gets its own control to the right. */
const STATUS_CHIPS = STATUS_FILTERS.filter((entry) => entry.id !== 'archived')

export function SessionListPage() {
  const { sessions, loading, error, reload } = useSessionList()
  const archivedList = useArchivedSessions()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const timerRef = useRef<number | null>(null)
  // Rows archived (or unarchived) from here vanish at once; the refetch the move triggers resets both sets.
  const [hiddenLive, hideLive] = useHiddenIds(sessions)
  const [hiddenArchived, hideArchived] = useHiddenIds(archivedList.archived)

  // Live list: any store change refetches once, 300 ms after the last event (no polling). Archiving
  // moves a folder out of (or back into) `sessions/`, so the same events cover the archived list.
  const scheduleReload = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      reload()
      archivedList.reload()
    }, LIST_REFRESH_DEBOUNCE_MS)
  }
  const reloadBoth = () => {
    reload()
    archivedList.reload()
  }

  async function onArchive(session: SessionSummary) {
    try {
      await archiveSession(session.id)
      hideLive(session.id)
      reloadBoth()
    } catch (err) {
      toast.error(archiveErrorMessage(err))
    }
  }

  async function onUnarchive(session: ArchivedSession) {
    try {
      await unarchiveSession(session.id)
      hideArchived(session.id)
      reloadBoth()
    } catch (err) {
      toast.error("Couldn't unarchive the session", { description: archiveErrorMessage(err) })
    }
  }
  useStoreEvents({
    'session.added': scheduleReload,
    'session.updated': scheduleReload,
    'session.removed': scheduleReload,
    'review.updated': scheduleReload,
    'run.updated': scheduleReload,
    'tree.updated': scheduleReload,
    'resolutions.updated': scheduleReload,
  })
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )
  // Newest activity first (the server already orders; sorting here keeps a refetch stable), broken rows last.
  const items = [...(sessions ?? [])].filter((item) => !hiddenLive.has(item.id)).sort(byLastActivity)
  const archived = (archivedList.archived ?? []).filter((item) => !hiddenArchived.has(item.id))
  const counts = countByFilter(items, archived.length)
  const visible = items.filter((item) => matchesFilter(item, filter))

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center border-b bg-card px-6 md:px-8">
        <span className="text-lg font-semibold tracking-tight">Review Dash</span>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-8 pb-16 md:px-8">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Review sessions</h1>
          <div className="flex flex-wrap gap-1.5 pb-1" role="group" aria-label="Filter by status">
            {STATUS_CHIPS.map((entry) => {
              const active = entry.id === filter
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(entry.id)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[13px] font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.label} · {counts[entry.id]}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            aria-pressed={filter === 'archived'}
            onClick={() => setFilter(filter === 'archived' ? 'all' : 'archived')}
            className={cn(
              'ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              filter === 'archived' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            <Archive className="size-3.5" aria-hidden />
            Archived · {counts.archived}
          </button>
        </div>

        {error ? (
          <div className="mt-10 flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Couldn't load the sessions: {error.message}</p>
            <Button variant="outline" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <p className="mt-10 text-sm text-muted-foreground" aria-busy="true">
            Loading sessions…
          </p>
        ) : filter === 'archived' ? (
          <ArchivedList items={archived} error={archivedList.error} onUnarchive={onUnarchive} onDeleted={hideArchived} reloadArchived={archivedList.reload} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div
              className={cn(
                GRID,
                'mt-6 hidden px-5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
              )}
              aria-hidden
            >
              <div>Session</div>
              <div>Changes</div>
              <div>Progress</div>
              <div>Status</div>
              <div>Updated</div>
              <div />
            </div>
            <ul className="mt-2 flex flex-col gap-2.5">
              {visible.map((item) =>
                isSessionSummary(item) ? (
                  <SessionRow key={item.id} session={item} onArchive={onArchive} />
                ) : (
                  <BrokenRow key={item.id} item={item} />
                ),
              )}
              {visible.length === 0 && (
                <li className="rounded-2xl border border-dashed bg-card px-5 py-8 text-center text-sm text-muted-foreground">
                  No sessions match this filter.
                </li>
              )}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

function byLastActivity(a: SessionListItem, b: SessionListItem): number {
  const aOk = isSessionSummary(a)
  const bOk = isSessionSummary(b)
  if (aOk && bOk) return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  if (aOk !== bOk) return aOk ? -1 : 1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

interface SessionRowProps {
  session: SessionSummary
  onArchive: (session: SessionSummary) => void
}

function SessionRow({ session, onArchive }: SessionRowProps) {
  const navigate = useNavigate()
  const href = sessionRoute(session.id)

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
      <div
        role="link"
        tabIndex={0}
        aria-label={session.title}
        data-href={href}
        onClick={() => navigate(href)}
        onKeyDown={onKeyDown}
        className={cn(
          GRID,
          'group flex flex-col gap-2.5 cursor-pointer rounded-2xl border bg-card px-5 py-4 text-foreground shadow-xs transition outline-none hover:border-foreground/25 hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {session.tickets.map((ticket) => (
              <TicketChip key={ticket.key} ticket={ticket} />
            ))}
            <span className="truncate text-base font-semibold" title={session.title}>
              {session.title}
            </span>
          </div>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="shrink-0">{repoName(session.repo.path)} ·</span>
            <BranchPair baseRef={session.repo.baseRef} branch={session.repo.branch} />
          </span>
        </div>
        <div className={META}>
          <DiffStats additions={session.stats.additions} deletions={session.stats.deletions} files={session.stats.files} />
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {session.progress.reviewed}/{session.progress.total}
          </span>
          <div>
            <StatusPill summary={session} />
          </div>
          <time dateTime={session.updatedAt} className="text-[13px] text-muted-foreground">
            {formatRelativeTime(session.updatedAt)}
          </time>
          <span className="ml-auto flex items-center gap-1 lg:ml-0 lg:justify-self-end">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Archive ${session.title}`}
              title="Archive session"
              onClick={onArchiveClick}
              onKeyDown={(event) => event.stopPropagation()}
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
            >
              <Archive />
            </Button>
            <ChevronRight className="size-4.5 text-muted-foreground" aria-hidden />
          </span>
        </div>
      </div>
    </li>
  )
}

interface ArchivedListProps {
  items: readonly ArchivedSession[]
  error: Error | null
  onUnarchive: (session: ArchivedSession) => void
  /** Hides the row at once; the archived list is refetched right after. */
  onDeleted: (id: string) => void
  reloadArchived: () => void
}

/** The Archived filter: rows are not links (there is nothing to open), only Unarchive and Delete. */
function ArchivedList({ items, error, onUnarchive, onDeleted, reloadArchived }: ArchivedListProps) {
  const [toDelete, setToDelete] = useState<ArchivedSession | null>(null)
  const deletion = useDeleteArchived((id) => {
    onDeleted(id)
    reloadArchived()
  })

  function openDelete(session: ArchivedSession) {
    deletion.reset()
    setToDelete(session)
  }
  async function confirmDelete() {
    if (toDelete === null) return
    if (await deletion.remove(toDelete.id)) setToDelete(null)
  }

  if (error) {
    return <p className="mt-10 text-sm text-muted-foreground">Couldn't load the archived sessions: {error.message}</p>
  }
  return (
    <ul className="mt-6 flex flex-col gap-2.5">
      {items.map((session) => (
        <li
          key={session.id}
          aria-label={`Archived session ${session.title}`}
          className="flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl border bg-card/70 px-5 py-4 text-foreground shadow-xs"
        >
          <div className="flex min-w-0 basis-full flex-col gap-1.5 lg:flex-1 lg:basis-64">
            <div className="flex min-w-0 items-center gap-2.5">
              {session.tickets.map((ticket) => (
                <TicketChip key={ticket.key} ticket={ticket} />
              ))}
              <span className="truncate text-base font-semibold" title={session.title}>
                {session.title}
              </span>
            </div>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <span className="shrink-0">{repoName(session.repo.path)} ·</span>
              {session.repo.baseRef === null ? (
                <BranchRef name={session.repo.branch} />
              ) : (
                <BranchPair baseRef={session.repo.baseRef} branch={session.repo.branch} />
              )}
              <span className="shrink-0 whitespace-nowrap">
                · created{' '}
                <time dateTime={session.createdAt} title={session.createdAt}>
                  {formatRelativeTime(session.createdAt)}
                </time>
              </span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Archive className="size-3.5" aria-hidden />
            Archived{' '}
            <time dateTime={session.archivedAt} title={session.archivedAt}>
              {formatRelativeTime(session.archivedAt)}
            </time>
          </span>
          <span className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onUnarchive(session)} aria-label={`Unarchive ${session.title}`}>
              <ArchiveRestore data-icon="inline-start" />
              Unarchive
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openDelete(session)}
              aria-label={`Delete ${session.title}`}
              title="Delete permanently"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
            >
              <Trash2 />
            </Button>
          </span>
        </li>
      ))}
      {items.length === 0 && (
        <li className="rounded-2xl border border-dashed bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          No archived sessions.
        </li>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Delete this session permanently?"
        description={
          <>
            <span className="mb-1 block font-medium text-foreground">{toDelete?.title}</span>
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

function BrokenRow({ item }: { item: Extract<SessionListItem, { error: string }> }) {
  return (
    <li
      className={cn(GRID, 'flex flex-col gap-2.5 rounded-2xl border border-dashed bg-card/60 px-5 py-4 text-muted-foreground opacity-75')}
      aria-label={`Broken session ${item.id}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-mono text-sm">
          <TriangleAlert className="size-4 text-warn" aria-hidden />
          {item.id}
        </span>
        <span className="truncate text-xs">{item.error}</span>
      </div>
      <div className={META}>
        <span className="text-[13px]">—</span>
        <span className="text-[13px]">—</span>
        <span className="text-xs font-semibold uppercase tracking-wider">Broken</span>
        <span />
        <span />
      </div>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <p className="text-base font-semibold">No review sessions yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Start one from Claude Code with <code className="font-mono">ai-review init --repo &lt;path&gt;</code>.
      </p>
    </div>
  )
}
