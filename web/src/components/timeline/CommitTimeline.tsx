import { UNCOMMITTED_SCOPE, type ChangeStats, type CommitList, type Remote, type Scope } from '@review-dash/shared'
import { Layers } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatFileCount, formatStats } from '@/lib/format'
import { timelineItems, type TimelineItem } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { CommitNode, Dot, NodeShell, Ring, type LineStyle } from './CommitNode'
import { RemoteSummary } from './RemoteSummary'

/** What the selected scope's own tree load looks like, for the strip's busy and error states. */
export interface ScopeLoadState {
  loading: boolean
  error: Error | null
  reload: () => void
}

export interface CommitTimelineProps {
  /** The session's commit list; null until it has loaded (or when it failed). */
  list: CommitList | null
  loading: boolean
  error: Error | null
  /** The full diff's totals, shown under the "Full diff" node. */
  totals: ChangeStats
  /** The scope in the URL (null: the full diff). */
  selected: Scope | null
  onSelect: (scope: Scope | null) => void
  /** The selected scope's tree load (undefined for the full diff). */
  scopeLoad?: ScopeLoadState
  /** Leave the merge commits out of the strip (the selected one stays). */
  hideMerges?: boolean
  /** Rendered at the left end of the row (the files sidebar toggle). */
  leading?: ReactNode
}

const NO_REMOTE: Remote = { ref: null, ahead: 0, behind: 0 }

/** The line segment leading into `item`: dashed when it is not on the remote. */
function lineInto(item: TimelineItem | undefined): LineStyle | null {
  if (item === undefined || item.kind === 'full') return null
  return item.kind === 'commit' && item.commit.pushed ? 'solid' : 'dashed'
}

/**
 * The commits since the base as a git-graph strip above the cards: the "Full diff" node first, one
 * node per commit (oldest left, newest right) and the uncommitted changes at the end, with the
 * remote's ahead/behind at the right. Selecting a node narrows the page to that scope (`?commit=`).
 */
export function CommitTimeline({ list, loading, error, totals, selected, onSelect, scopeLoad, hideMerges = false, leading }: CommitTimelineProps) {
  const stripRef = useRef<HTMLUListElement>(null)
  const items = timelineItems(list, { hideMerges, selected })
  const itemCount = items.length
  const remote = list?.remote ?? NO_REMOTE

  // Keep the selected node centred in the strip.
  useEffect(() => {
    const strip = stripRef.current
    const node = strip?.querySelector<HTMLElement>('[aria-pressed="true"]')?.parentElement
    if (!strip || !node) return
    strip.scrollLeft = Math.max(0, node.offsetLeft - (strip.clientWidth - node.offsetWidth) / 2)
  }, [selected, itemCount])

  const busy = (list === null && loading) || scopeLoad?.loading === true

  return (
    <TooltipProvider delay={150}>
      <section aria-label="Commits" className="flex shrink-0 items-center gap-2 border-b bg-card py-2 pr-3 pl-2">
        {leading}
        <ul
          ref={stripRef}
          aria-busy={busy || undefined}
          className="relative flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden px-2 pt-1 pb-2 [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-10px),transparent)] [scrollbar-width:thin]"
          data-testid="commit-strip"
        >
          {items.map((item, index) => {
            const incoming = lineInto(item)
            const outgoing = lineInto(items[index + 1])
            if (item.kind === 'commit') {
              return (
                <CommitNode
                  key={item.scope}
                  commit={item.commit}
                  remote={remote}
                  selected={selected === item.scope}
                  incoming={incoming}
                  outgoing={outgoing}
                  onSelect={() => onSelect(item.scope)}
                />
              )
            }
            if (item.kind === 'uncommitted') {
              const active = selected === UNCOMMITTED_SCOPE
              return (
                <NodeShell
                  key={item.scope}
                  selected={active}
                  incoming={incoming}
                  outgoing={outgoing}
                  label={`Uncommitted changes: ${formatFileCount(item.stats.files)}`}
                  data-scope={UNCOMMITTED_SCOPE}
                  onSelect={() => onSelect(UNCOMMITTED_SCOPE)}
                  node={<Dot selected={active} dashed />}
                  primary={<span className={cn(active && 'font-semibold')}>Uncommitted</span>}
                  secondary={formatFileCount(item.stats.files)}
                  tooltip={
                    <>
                      <span className="font-medium">Uncommitted changes</span>
                      <span className="opacity-80 tabular-nums">
                        {formatFileCount(item.stats.files)} {formatStats(item.stats.additions, item.stats.deletions)}
                      </span>
                      <span className="opacity-80">The index and the working tree against HEAD</span>
                    </>
                  }
                />
              )
            }
            const active = selected === null
            const stats = `${formatFileCount(totals.files)} ${formatStats(totals.additions, totals.deletions)}`
            return (
              <NodeShell
                key="full"
                selected={active}
                incoming={null}
                outgoing={outgoing}
                label={`Full diff: ${stats}`}
                data-scope="full"
                onSelect={() => onSelect(null)}
                node={
                  <Ring selected={active}>
                    <Layers className="size-3" />
                  </Ring>
                }
                primary={<span className={cn(active && 'font-semibold')}>Full diff</span>}
                secondary={stats}
                tooltip={
                  <>
                    <span className="font-medium">Full diff</span>
                    <span className="opacity-80 tabular-nums">{stats}</span>
                    <span className="opacity-80">The working tree against the base</span>
                  </>
                }
              />
            )
          })}
          {error && (
            <li role="status" className="flex h-5 items-center self-start text-xs text-muted-foreground">
              Couldn't load the commits: {error.message}
            </li>
          )}
        </ul>
        {scopeLoad?.error && (
          <span role="status" className="flex shrink-0 items-center gap-1 text-xs text-reject">
            <span title={scopeLoad.error.message}>Couldn't load this scope</span>
            <Button variant="ghost" size="xs" onClick={scopeLoad.reload}>
              Retry
            </Button>
          </span>
        )}
        {list && <RemoteSummary remote={list.remote} />}
      </section>
    </TooltipProvider>
  )
}
