import { anchorLabel, currentProposal, type PrFinding, type ProposalReview } from '@scout/shared'
import { Check, FileText, Image as ImageIcon, MessageSquare, Video, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { Tag } from '@/components/ui/tag'
import { splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { useEvidenceSrc } from './finding-comments'
import { useCurrentPrReport } from './pr-review-context'
import { orderedEvidence } from './reproduction-evidence'
import { useProposal } from './useProposal'

type Decision = ProposalReview['verdict']
type GridFilter = 'all' | Decision

const FILTERS: readonly { id: GridFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

const SEVERITY_TONE = { critical: 'err', high: 'err', medium: 'warn', low: 'info' } as const
const STAMP: Record<Exclude<Decision, 'none'>, string> = { approved: 'border-ok-bd text-green', rejected: 'border-err-bd text-red' }

function plural(n: number, noun: string): string | null {
  return n === 0 ? null : `${n} ${noun}${n === 1 ? '' : 's'}`
}

interface FindingTileProps {
  finding: PrFinding
  decision: Decision
  current: boolean
  comments: number
  onOpen: () => void
}

/** A finding at a glance: its first screenshot, title, severity, status, where it is, its evidence and your decision. `A` / `X` decide a focused tile; Enter opens it. */
function FindingTile({ finding, decision, current, comments, onOpen }: FindingTileProps) {
  const srcOf = useEvidenceSrc()
  const proposal = useProposal(finding)
  const [failed, setFailed] = useState(false)
  const items = orderedEvidence(finding.reproduction)
  const shot = items.find((item) => item.kind === 'screenshot')
  const counts = [
    plural(items.filter((item) => item.kind === 'screenshot').length, 'screenshot'),
    plural(items.filter((item) => item.kind === 'video').length, 'video'),
    plural(items.filter((item) => item.kind === 'log' || item.kind === 'test').length, 'log'),
  ].filter((part) => part !== null)

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter') onOpen()
    else if (event.key === 'a' || event.key === 'A') proposal?.toggleApprove()
    else if (event.key === 'x' || event.key === 'X') proposal?.toggleReject()
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <li
      data-finding={finding.id}
      aria-current={current ? 'true' : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-fine border-line bg-surface outline-none hover:shadow-raised focus-visible:ring-2 focus-visible:ring-yellow',
        current && 'ring-2 ring-yellow',
      )}
    >
      <div className="grid h-32 place-items-center overflow-hidden border-b-fine border-line bg-sunken">
        {shot && !failed ? (
          <img src={srcOf(shot)} alt="" onError={() => setFailed(true)} className="size-full object-cover object-top" />
        ) : items.some((item) => item.kind === 'video') ? (
          <Video aria-hidden className="size-6 text-ink-muted" />
        ) : items.length > 0 ? (
          <FileText aria-hidden className="size-6 text-ink-muted" />
        ) : (
          <span className="text-xs text-ink-muted">No evidence</span>
        )}
      </div>
      {decision !== 'none' && (
        <span
          role="img"
          aria-label={decision === 'approved' ? 'Suggestion approved' : 'Suggestion rejected'}
          className={cn('absolute top-2 right-2 grid size-7 place-items-center rounded-full border-2 bg-surface', STAMP[decision])}
        >
          {decision === 'approved' ? <Check aria-hidden className="size-4 stroke-[3]" /> : <X aria-hidden className="size-4 stroke-[3]" />}
        </span>
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <strong className="line-clamp-2 text-[13.5px] leading-snug" title={finding.title}>{finding.title}</strong>
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag size="sm" tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Tag>
          <Tag size="sm" tone={finding.reproduction.status === 'reproduced' ? 'ok' : 'warn'}>{finding.reproduction.status}</Tag>
        </span>
        <span className="truncate font-mono text-[11px] text-ink-muted">{splitPath(finding.path).name} · {anchorLabel(finding.anchor)}</span>
        <span className="mt-auto flex items-center gap-2 pt-1 text-[11.5px] font-semibold text-ink-muted">
          {counts.length > 0 ? <span className="inline-flex items-center gap-1"><ImageIcon aria-hidden className="size-3" />{counts.join(' · ')}</span> : null}
          {comments > 0 && <span className="ml-auto inline-flex items-center gap-[3px] tabular-nums" title={`${comments} comments`}><MessageSquare aria-hidden className="size-3" />{comments}</span>}
        </span>
      </div>
    </li>
  )
}

export interface FindingGridProps {
  findings: readonly PrFinding[]
  currentId: string
  commentCounts: ReadonlyMap<string, number>
  /** Open the finding in the swipe deck. */
  onOpen: (id: string) => void
}

/** Grid mode of the PR review's Evidence page: every finding as a tile, under a filter by your decision on its suggested comment. */
export function FindingGrid({ findings, currentId, commentCounts, onOpen }: FindingGridProps) {
  const { report, current } = useCurrentPrReport()
  const { state } = useReview()
  const [filter, setFilter] = useState<GridFilter>('all')
  const gridRef = useRef<HTMLUListElement>(null)
  const decisionOf = (finding: PrFinding): Decision => (report && current ? currentProposal(report, finding, state.review).verdict : 'none')
  const counts: Record<Decision, number> = { none: 0, approved: 0, rejected: 0 }
  for (const finding of findings) counts[decisionOf(finding)] += 1
  const shown = filter === 'all' ? findings : findings.filter((finding) => decisionOf(finding) === filter)

  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-finding="${CSS.escape(currentId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
      <Segmented aria-label="Show findings" className="max-w-full self-start overflow-x-auto overflow-y-hidden">
        {FILTERS.map((option) => (
          <SegmentedItem key={option.id} pressed={option.id === filter} count={option.id === 'all' ? findings.length : counts[option.id]} onClick={() => setFilter(option.id)} className="h-7 px-3">
            {option.label}
          </SegmentedItem>
        ))}
      </Segmented>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-muted">
          <p>No findings match this filter.</p>
          <Button size="sm" onClick={() => setFilter('all')}>Clear filter</Button>
        </div>
      ) : (
        <ul ref={gridRef} aria-label="All findings" className="m-0 grid list-none gap-3.5 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {shown.map((finding) => (
            <FindingTile key={finding.id} finding={finding} decision={decisionOf(finding)} current={finding.id === currentId} comments={commentCounts.get(finding.id) ?? 0} onOpen={() => onOpen(finding.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}
