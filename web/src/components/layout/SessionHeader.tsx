import { sessionStatus } from '@review-dash/shared'
import { Archive, ChevronLeft, Keyboard, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { DiffStats } from '@/components/session/DiffStats'
import { StatusPill } from '@/components/session/StatusPill'
import { TicketChips } from '@/components/session/TicketChip'
import { BranchPair } from '@/components/common/BranchRef'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { archiveErrorMessage, archiveSession } from '@/lib/archive'
import { repoName } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { ModeToggle } from './ModeToggle'

interface SectionTab {
  to: string
  label: string
  /** Shown when > 0 (Files always shows its count). */
  count?: number
}

export interface SessionHeaderProps {
  /** Opens the keyboard shortcut help. */
  onHelp?: () => void
}

/** The horizontal gutter, shared with the commit timeline and the files sidebar (`px-3`). */
const GUTTER = 'px-3'

export function SessionHeader({ onHelp }: SessionHeaderProps) {
  const { detail } = useSessionContext()
  const { manifest, tree } = detail
  const { state, progress, saveStatus, comments, resolutions } = useReview()
  const openComments = comments.filter((comment) => comment.status === 'open').length
  const location = useLocation()
  const navigate = useNavigate()
  const [archiving, setArchiving] = useState(false)
  const onFiles = /\/files(\/|$)/.test(location.pathname)

  // Reversible (the folder moves to archive/), so no confirmation; the list is where it comes back from.
  async function onArchive() {
    setArchiving(true)
    try {
      await archiveSession(manifest.id)
      await navigate('/')
    } catch (err) {
      toast.error(archiveErrorMessage(err))
      setArchiving(false)
    }
  }
  // Derived locally so the pill follows the live review and tree (the server's copy lags the autosave).
  const status = sessionStatus({ review: state.review, tree, resolutions, activeRun: detail.activeRunId !== null })
  const branch = tree.branch ?? manifest.repo.branch
  const baseRef = tree.baseRef || manifest.repo.baseRef
  // The diff follows whatever is checked out: say so when that is no longer the session's branch.
  const branchChanged = tree.branch !== null && manifest.repo.branch !== null && tree.branch !== manifest.repo.branch

  const tabs: SectionTab[] = [
    { to: 'files', label: 'Files', count: tree.files.length },
    { to: 'evidence', label: 'Evidence', count: detail.evidence.length },
    { to: 'spec', label: 'Spec', count: detail.spec.length },
    { to: 'extras', label: 'Extras', count: detail.extras.length },
    { to: 'submit', label: 'Submit' },
  ]
  const percent = progress.total === 0 ? 0 : Math.round((progress.reviewed / progress.total) * 100)

  return (
    <TooltipProvider delay={150}>
      <header className="sticky top-0 z-20 border-b bg-card">
        {/* One row; narrower than the title block's 20rem (so the branch chips stay readable), the tabs drop to a right-aligned second row. */}
        <div className={cn('flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2', GUTTER)}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/"
                  aria-label="Sessions"
                  className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                />
              }
            >
              <ChevronLeft className="size-5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">Sessions</TooltipContent>
          </Tooltip>
          <TicketChips tickets={manifest.tickets} className="max-w-[45%] shrink-0" />
          <div className="flex min-w-0 flex-1 basis-80 flex-col">
            <h1 className="min-w-0 truncate text-[15px] leading-5 font-semibold" title={manifest.title}>
              {manifest.title}
            </h1>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-4 text-muted-foreground">
              <span className="shrink-0" title={manifest.repo.path}>
                {repoName(manifest.repo.path)} ·
              </span>
              <BranchPair baseRef={baseRef} baseSha={tree.baseSha} baseVirtual={tree.baseVirtual} branch={branch} />
            </span>
          </div>
          {/* One group, so tabs and archive wrap to the second row together. */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <nav aria-label="Sections" className="flex shrink-0 gap-0.5 rounded-lg bg-background p-0.75">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to === 'files' && onFiles ? { pathname: tab.to, search: location.search } : tab.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition',
                      isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  {tab.label}
                  {tab.count !== undefined && (tab.to === 'files' || tab.count > 0) && (
                    <span className="ml-1.5 text-xs opacity-70 tabular-nums">{tab.count}</span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Archive session"
                    onClick={onArchive}
                    disabled={archiving}
                    className="-mr-1.5 text-muted-foreground"
                  />
                }
              >
                <Archive />
              </TooltipTrigger>
              <TooltipContent side="bottom">Archive session</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className={cn('flex h-11 items-center gap-3 border-t bg-background/70 text-[13px]', GUTTER)}>
          <DiffStats additions={tree.stats.additions} deletions={tree.stats.deletions} files={tree.stats.files} />
          <span className="text-muted-foreground">·</span>
          <span className="whitespace-nowrap">
            <span className="hidden text-muted-foreground sm:inline">reviewed </span>
            <span className="font-semibold tabular-nums">
              {progress.reviewed}/{progress.total}
            </span>
          </span>
          <Progress value={percent} aria-label="Review progress" className="hidden w-40 min-w-12 shrink gap-0 md:block **:data-[slot=progress-track]:bg-border">
            {null}
          </Progress>
          <StatusPill summary={{ status, progress, openComments }} className="shrink-0" />
          {branchChanged && (
            <span
              role="status"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-warn-foreground"
              title={`The session was created on ${manifest.repo.branch}; the repository is now on ${tree.branch}. The diff follows the checkout.`}
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              Branch changed
              <span className="hidden xl:inline">
                {' · now on '}
                <span className="font-mono">{tree.branch}</span>
              </span>
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span className="w-16 text-right text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Not saved' : ''}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={onHelp} className="text-muted-foreground" />}
              >
                <Keyboard />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Keyboard shortcuts
                <Kbd>?</Kbd>
              </TooltipContent>
            </Tooltip>
            {onFiles && <ModeToggle />}
          </div>
        </div>
      </header>
    </TooltipProvider>
  )
}
