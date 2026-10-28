import { UNCOMMITTED_SCOPE, type ChangeStats, type CommitList, type Remote, type Scope } from '@scout/shared'
import { Layers } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatFileCount, formatStats } from '@/lib/format'
import { timelineItems, type TimelineItem } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { CommitNode, Dot, NodeShell, Ring, type LineStyle } from './CommitNode'

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
}

const NO_REMOTE: Remote = { ref: null, ahead: 0, behind: 0 }

/** The line segment leading into `item`: dashed when it is not on the remote. */
function lineInto(item: TimelineItem | undefined): LineStyle | null {
  if (item === undefined || item.kind === 'full') return null
  return item.kind === 'commit' && item.commit.pushed ? 'solid' : 'dashed'
}

/**
 * The commits since the base as a git-graph strip above the cards, flush on the page background (no band): the "Full diff" node first, one
 * node per commit (oldest left, newest right) and the uncommitted changes at the end. Each commit
 * carries its pushed state; the line is dashed where the remote does not have it yet. Selecting a
 * node narrows the page to that scope (`?commit=`).
 */
export function CommitTimeline({ list, loading, error, totals, selected, onSelect, scopeLoad, hideMerges = false }: CommitTimelineProps) {
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
      <section
        aria-label="Commits"
        data-compact={itemCount <= 2 || undefined}
        className="group/tl flex shrink-0 items-start py-1 pr-5 pl-3.5"
      >
        <ul
          ref={stripRef}
          aria-busy={busy || undefined}
          className="relative flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden px-2 pt-1.5 pb-1.5 [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-10px),transparent)] [scrollbar-width:thin]"
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
                  primary={<span className={cn(active && 'font-bold')}>Uncommitted</span>}
                  secondary={formatFileCount(item.stats.files)}
                  tooltip={
                    <>
                      <span className="font-bold">Uncommitted changes</span>
                      <span className="opacity-80 tabular-nums">
                        {formatFileCount(item.stats.files)} {formatStats(item.stats.additions, item.stats.deletions)}
                      </span>
                      <span className="opacity-80">Index and working tree vs HEAD</span>
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
                    <Layers />
                  </Ring>
                }
                primary={<span className={cn(active && 'font-bold')}>Full diff</span>}
                secondary={stats}
                tooltip={
                  <>
                    <span className="font-bold">Full diff</span>
                    <span className="opacity-80 tabular-nums">{stats}</span>
                    <span className="opacity-80">Working tree vs base</span>
                  </>
                }
              />
            )
          })}
          {error && (
            <li role="status" className="flex h-[22px] items-center self-start text-xs font-semibold text-ink-muted">
              Couldn't load the commits: {error.message}
            </li>
          )}
        </ul>
        {scopeLoad?.error && (
          <span role="status" className="flex shrink-0 items-center gap-1 self-center text-xs font-semibold text-red">
            <span title={scopeLoad.error.message}>Couldn't load this scope</span>
            <Button variant="ghost" size="sm" onClick={scopeLoad.reload}>
              Retry
            </Button>
          </span>
        )}
      </section>
    </TooltipProvider>
  )
}
