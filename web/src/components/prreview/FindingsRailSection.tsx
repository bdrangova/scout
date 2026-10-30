import { anchorLabel, currentProposal, type PrFinding } from '@scout/shared'
import { Check, MessageSquare, X } from 'lucide-react'
import { useContext } from 'react'
import { useCommentedOnlyFilter } from '@/components/layout/commented-only'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { RailSection } from '@/components/layout/RailSlot'
import { SidebarContext } from '@/components/layout/sidebar-context'
import { RailBlock } from '@/components/spec/RailItem'
import { splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'

const SEVERITY_DOT = { critical: 'bg-red', high: 'bg-red', medium: 'bg-warn-bd', low: 'bg-ink-muted' } as const

export interface FindingsRailSectionProps {
  findings: readonly PrFinding[]
  /** Comments said about each finding (see `useFindingCommentCounts`); absent means none. */
  commentCounts: ReadonlyMap<string, number>
  currentId: string
  onSelect: (id: string) => void
}

/** The PR review Evidence page's block in the rail: the findings with severity, where they are, your decision on the suggested comment and how much was said. */
export function FindingsRailSection({ findings, commentCounts, currentId, onSelect }: FindingsRailSectionProps) {
  const { report, current } = useCurrentPrReport()
  const { state } = useReview()
  const sidebar = useContext(SidebarContext)
  const commented = useCommentedOnlyFilter(findings, (finding) => commentCounts.has(finding.id))
  if (!report) return null
  return (
    <RailSection>
      <RailBlock
        title="Findings"
        count={findings.length}
        shown={commented.active ? commented.items.length : undefined}
        action={<CommentedOnlyToggle size="sm" count={commented.count} active={commented.active} onToggle={commented.toggle} />}
      >
        <ol aria-label="Findings" className="m-0 flex list-none flex-col gap-0.5 p-0">
          {commented.items.map((finding) => {
            const isCurrent = finding.id === currentId
            const verdict = current ? currentProposal(report, finding, state.review).verdict : 'none'
            const comments = commentCounts.get(finding.id) ?? 0
            return (
              <li key={finding.id}>
                <button
                  type="button"
                  aria-current={isCurrent ? 'true' : undefined}
                  title={`${finding.title} · ${finding.severity}`}
                  onClick={() => {
                    onSelect(finding.id)
                    if (sidebar && !sidebar.desktop) sidebar.close()
                  }}
                  className={cn(
                    'flex min-h-10 w-full min-w-0 items-center gap-[9px] rounded-[10px] border-fine px-2 py-[5px] text-left text-[13px] font-semibold',
                    isCurrent ? 'border-line bg-yellow text-on-yellow' : 'border-transparent hover:bg-paper',
                  )}
                >
                  <span aria-label={finding.severity} role="img" className={cn('size-2.5 shrink-0 rounded-full', SEVERITY_DOT[finding.severity])} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate leading-[17px]">{finding.title}</span>
                    <span className={cn('truncate font-mono text-[11px] font-medium', isCurrent ? 'text-on-yellow/80' : 'text-ink-muted')}>
                      {splitPath(finding.path).name} · {anchorLabel(finding.anchor)}
                      {finding.reproduction.status !== 'reproduced' && ` · ${finding.reproduction.status}`}
                    </span>
                  </span>
                  {comments > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-[3px] text-[11.5px] font-bold tabular-nums" title={`${comments} ${comments === 1 ? 'comment' : 'comments'}`}>
                      <MessageSquare aria-hidden className="size-3" />
                      {comments}
                    </span>
                  )}
                  {verdict === 'approved' && <Check role="img" aria-label="Suggestion approved" className={cn('size-3.5 shrink-0 stroke-[3]', !isCurrent && 'text-green')} />}
                  {verdict === 'rejected' && <X role="img" aria-label="Suggestion rejected" className={cn('size-3.5 shrink-0 stroke-[3]', !isCurrent && 'text-red')} />}
                </button>
              </li>
            )
          })}
        </ol>
      </RailBlock>
    </RailSection>
  )
}
