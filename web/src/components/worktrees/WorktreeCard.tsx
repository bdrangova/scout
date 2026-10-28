import type { WorktreeSummary } from '@review-dash/shared'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Branches, CardLine, RepoName } from '@/components/sessions/SessionCards'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { worktreeRoute } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { WorktreeStats } from './WorktreeStats'

/** "Dev 2 · PR 1 · Test 1": the non-zero linked session counts, or a muted note. */
export function SessionCountChips({ counts }: { counts: WorktreeSummary['sessions'] }) {
  const chips = [
    { label: 'Dev', count: counts['code-review'] },
    { label: 'PR', count: counts['pr-review'] },
    { label: 'Test', count: counts['test-run'] },
  ].filter((chip) => chip.count > 0)
  if (chips.length === 0) return <span className="shrink-0 text-ink-muted">No sessions</span>
  return (
    <>
      {chips.map((chip) => (
        <Tag key={chip.label} size="sm" className="shrink-0">{chip.label} {chip.count}</Tag>
      ))}
    </>
  )
}

interface WorktreeCardProps {
  worktree: WorktreeSummary
  onDelete: (worktree: WorktreeSummary) => void
  layout?: 'grid' | 'list'
}

/** One worktree, in the list or grid layout of the session cards; opens `/w/:id`. */
export function WorktreeCard({ worktree, onDelete, layout = 'grid' }: WorktreeCardProps) {
  const navigate = useNavigate()
  const href = worktreeRoute(worktree.id)
  return (
    <li className="min-w-0">
      <Panel
        role="link"
        tabIndex={0}
        aria-label={worktree.name}
        data-href={href}
        data-layout={layout}
        onClick={() => navigate(href)}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            navigate(href)
          }
        }}
        className="h-full cursor-pointer gap-3 p-4 transition-colors hover:bg-paper-2"
      >
        <div className="flex min-w-0 items-center gap-x-3">
          <CardLine label="Worktree name" className="flex-1"><span className="text-sm font-bold" title={worktree.path}>{worktree.name}</span></CardLine>
          {worktree.ticket && <TicketStrip tickets={[{ key: worktree.ticket, url: null }]} quiet className="shrink-0" />}
        </div>
        <div className={cn('flex min-w-0 flex-col gap-3 border-t-fine border-line/30 pt-3', layout === 'list' && 'md:border-t-0 md:pt-0')}>
          {layout === 'grid' ? (
            <>
              <Branches base={worktree.baseRef} current={worktree.branch} />
              <CardLine label="Changes"><WorktreeStats worktree={worktree} leadingSeparator={false} /></CardLine>
            </>
          ) : (
            <Branches base={worktree.baseRef} current={worktree.branch}>
              <WorktreeStats worktree={worktree} />
            </Branches>
          )}
        </div>
        <div className={cn('mt-auto flex min-w-0 items-center gap-2 border-t-fine border-line/30 pt-3 text-[11px] text-ink-muted', layout === 'list' && '-mt-2 border-t-0 pt-0')}>
          <CardLine label="Worktree details" className="flex-1">
            {worktree.mainRepo && <><RepoName path={worktree.mainRepo} /><span>·</span></>}
            {layout === 'list' && <><span title={worktree.path} className="font-mono">{worktree.path}</span><span aria-hidden>·</span></>}
            <SessionCountChips counts={worktree.sessions} />
          </CardLine>
          <Button variant="ghost" size="icon-sm" title="Delete worktree" aria-label={`Delete worktree ${worktree.name}`} onClick={(event) => { event.stopPropagation(); onDelete(worktree) }} className="shrink-0 text-ink-muted shadow-none hover:bg-red-solid hover:text-on-red"><Trash2 aria-hidden /></Button>
        </div>
      </Panel>
    </li>
  )
}
