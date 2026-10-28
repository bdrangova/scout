import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { WorktreeSummary } from '@scout/shared'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionLayoutToggle } from '@/components/sessions/SessionLayoutToggle'
import { SESSION_CARD_GRID, useSessionListLayout } from '@/components/sessions/session-list-layout'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { DeleteWorktreeDialog } from '@/components/worktrees/DeleteWorktreeDialog'
import { SettingsDialog } from '@/components/worktrees/SettingsDialog'
import { WorktreeCard } from '@/components/worktrees/WorktreeCard'
import { NoFoldersState, NoWorktreesState } from '@/components/worktrees/WorktreeStates'
import { matchesWorktreeSearch } from '@/components/worktrees/worktree-search'
import { useWorktrees } from '@/hooks/useWorktrees'
import { otherKindRoute } from '@/lib/paths'
import { useHiddenIds } from '@/lib/useHiddenIds'
import { useHotkeys } from '@/lib/useHotkeys'
import { cn } from '@/lib/utils'

/** `/w`: the git worktrees found in the configured folders, as the same cards as the session lists. */
export function WorktreesPage() {
  const list = useWorktrees()
  const { layout, setLayout } = useSessionListLayout()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<WorktreeSummary | null>(null)
  const [hidden, hide] = useHiddenIds(list.data?.items ?? null)
  useHotkeys({ toggleKind: () => navigate(otherKindRoute('worktrees')) })

  const data = list.data
  const items = (data?.items ?? []).filter((item) => !hidden.has(item.id))
  const visible = items.filter((item) => matchesWorktreeSearch(item, query))

  return (
    <div data-page="worktree-list" className="flex min-h-screen flex-col">
      <SessionsBar kind="worktrees" onHelp={() => setHelpOpen((open) => !open)} onSettingsSaved={list.reload} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-[18px]">
          <div className="flex flex-col gap-5">
            <h1 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em]">Worktrees</h1>
            <div className="flex flex-wrap items-center gap-3">
              <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-1">
                <label className="relative min-w-0 max-sm:w-full">
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted" />
                  <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search worktrees" placeholder="Search worktrees…" title="Search by name, ticket, branch, repository, or path" className="h-9 w-64 pl-9 max-sm:w-full" />
                </label>
                <div className="max-sm:justify-self-end"><SessionLayoutToggle layout={layout} onLayout={setLayout} /></div>
              </div>
            </div>
          </div>

          {list.error && !data ? (
            <ErrorState message={`Couldn't load the worktrees: ${list.error.message}`} onRetry={list.reload} />
          ) : !data ? (
            <LoadingState label="Loading worktrees…" />
          ) : (
            <>
              {data.errors.length > 0 && (
                <div className="flex flex-col items-start gap-2">
                  {data.errors.map((entry) => (
                    <Notice key={entry.folder} tone="warn">Can't read {entry.folder}: {entry.error}</Notice>
                  ))}
                </div>
              )}
              {data.folders.length === 0 ? (
                <NoFoldersState onOpenSettings={() => setSettingsOpen(true)} />
              ) : items.length === 0 ? (
                <NoWorktreesState folders={data.folders} />
              ) : (
                <ul aria-label="Worktrees" className={cn('m-0 list-none p-0', layout === 'grid' ? SESSION_CARD_GRID : 'flex flex-col gap-3.5')}>
                  {visible.map((item) => <WorktreeCard key={item.id} worktree={item} layout={layout} onDelete={setDeleting} />)}
                  {visible.length === 0 && <ListNote>No worktrees match your search.</ListNote>}
                </ul>
              )}
            </>
          )}
        </div>
      </main>
      {deleting && (
        <DeleteWorktreeDialog
          key={deleting.id}
          worktree={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            hide(deleting.id)
            setDeleting(null)
            list.reload()
          }}
        />
      )}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={list.reload} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
