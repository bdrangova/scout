import { ChevronLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import type { WorktreeDetail } from '@scout/shared'
import { CopyButton } from '@/components/common/CopyButton'
import { Eyebrow } from '@/components/common/Eyebrow'
import { ShortcutHelp } from '@/components/common/ShortcutHelp'
import { BranchPair, BranchRef } from '@/components/common/BranchRef'
import { TicketStrip } from '@/components/session/TicketStrip'
import { LiveSessionCard } from '@/components/sessions/SessionCards'
import { ErrorState, ListNote, LoadingState } from '@/components/sessions/SessionListStates'
import { SessionLayoutToggle } from '@/components/sessions/SessionLayoutToggle'
import { SESSION_CARD_GRID, useSessionListLayout } from '@/components/sessions/session-list-layout'
import { SessionsBar } from '@/components/sessions/SessionsBar'
import { Button, buttonVariants } from '@/components/ui/button'
import { DeleteWorktreeDialog } from '@/components/worktrees/DeleteWorktreeDialog'
import { StartSessionPanels } from '@/components/worktrees/StartSessionPanels'
import { WorktreeStats } from '@/components/worktrees/WorktreeStats'
import { useWorktree } from '@/hooks/useWorktrees'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'
import { otherKindRoute, WORKTREES_ROUTE } from '@/lib/paths'
import { isLiveSummary, type LiveSummary } from '@/lib/session-status'
import { useHotkeys } from '@/lib/useHotkeys'
import { cn } from '@/lib/utils'

function Heading({ worktree, onDelete }: { worktree: WorktreeDetail; onDelete: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 min-w-0 text-[26px] leading-[1.1] font-bold tracking-[-.01em] break-words">{worktree.name}</h1>
        {worktree.ticket && <TicketStrip tickets={[{ key: worktree.ticket, url: null }]} />}
        <Button variant="reject" size="sm" onClick={onDelete} className="ml-auto"><Trash2 aria-hidden />Delete worktree</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {worktree.baseRef ? <BranchPair baseRef={worktree.baseRef} branch={worktree.branch} /> : <BranchRef name={worktree.branch} />}
        <WorktreeStats worktree={worktree} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
        <code className="min-w-0 truncate font-mono" title={worktree.path}>{worktree.path}</code>
        <CopyButton value={worktree.path} label="path" />
      </div>
    </div>
  )
}

/** `/w/:id`: one worktree, how to start sessions in it, and its live sessions. */
export function WorktreeDetailPage() {
  const { id } = useParams()
  const { worktree, loading, error, reload } = useWorktree(id)
  const { layout, setLayout } = useSessionListLayout()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useHotkeys({ toggleKind: () => navigate(otherKindRoute('worktrees')) })

  async function archive(session: LiveSummary) {
    try {
      await archiveSession(session.id)
      reload()
      toast.success('Session archived', {
        description: session.title,
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            void unarchiveSession(session.id).then(reload, (reason: unknown) => toast.error("Couldn't restore the session", { description: archiveErrorMessage(reason) }))
          },
        },
      })
    } catch (err) {
      toast.error(archiveErrorMessage(err))
    }
  }

  const sessions = (worktree?.linkedSessions ?? []).filter(isLiveSummary)

  return (
    <div data-page="worktree-detail" className="flex min-h-screen flex-col">
      <SessionsBar kind="worktrees" onHelp={() => setHelpOpen((open) => !open)} />

      <main className="flex flex-1 flex-col px-6 pt-7 pb-14">
        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6">
          <Link to={WORKTREES_ROUTE} className={cn(buttonVariants({ size: 'sm' }), 'self-start')}>
            <ChevronLeft aria-hidden />
            Worktrees
          </Link>

          {error && !worktree ? (
            <ErrorState message={`Couldn't load the worktree: ${error.message}`} onRetry={reload} />
          ) : loading || !worktree ? (
            <LoadingState label="Loading worktree…" />
          ) : (
            <>
              <Heading worktree={worktree} onDelete={() => setDeleting(true)} />

              <section aria-label="Start a session" className="flex flex-col gap-3">
                <Eyebrow as="h2">Start a session</Eyebrow>
                <StartSessionPanels />
              </section>

              <section aria-label="Sessions" className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Eyebrow as="h2">Sessions</Eyebrow>
                  <div className="ml-auto"><SessionLayoutToggle layout={layout} onLayout={setLayout} /></div>
                </div>
                <ul aria-label="Linked sessions" className={cn('m-0 list-none p-0', layout === 'grid' ? SESSION_CARD_GRID : 'flex flex-col gap-3.5')}>
                  {sessions.map((item) => <LiveSessionCard key={item.id} session={item} layout={layout} showKind onArchive={archive} />)}
                  {sessions.length === 0 && <ListNote>No sessions for this worktree yet.</ListNote>}
                </ul>
              </section>

              {deleting && <DeleteWorktreeDialog worktree={worktree} onClose={() => setDeleting(false)} onDeleted={() => navigate(WORKTREES_ROUTE)} />}
            </>
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
