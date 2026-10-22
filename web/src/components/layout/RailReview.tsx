import type { Decision } from '@review-dash/shared'
import { StatusLegend } from '@/components/session/StatusLegend'
import { VerdictBar } from '@/components/session/VerdictBar'
import { Tag } from '@/components/ui/tag'
import type { VerdictSummary } from '@/components/submit/verdict-summary'
import { VERDICT_STYLE, type VerdictKind } from '@/lib/verdict'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { BranchChangedNotice } from './BranchChangedNotice'
import { SessionStatusNotice } from './SessionStatusNotice'
import type { SessionSummaryView } from './useSessionSummary'
import type { RailDensity } from './useRailDensity'

const COUNTS: readonly { kind: Exclude<VerdictKind, 'none'>; key: 'approved' | 'rejected' | 'commented'; label: string }[] = [
  { kind: 'approved', key: 'approved', label: 'approved' },
  { kind: 'rejected', key: 'rejected', label: 'rejected' },
  { kind: 'commented', key: 'commented', label: 'commented' },
]

function VerdictCounts({ verdicts, withRest = false, className }: { verdicts: VerdictSummary; withRest?: boolean; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {COUNTS.map(({ kind, key, label }) => {
        const { icon: Icon, className: text, iconClassName } = VERDICT_STYLE[kind]
        return (
          <span key={kind} title={`${verdicts[key]} ${label}`} className={cn('inline-flex items-center gap-[3px] text-[12.5px] font-bold tabular-nums', text)}>
            <Icon aria-hidden className={cn('size-3.5 stroke-[3]', iconClassName)} />
            <span aria-hidden>{verdicts[key]}</span>
            <span className="sr-only">
              {verdicts[key]} {label}
            </span>
          </span>
        )
      })}
      {withRest && <span className="text-[12.5px] font-bold text-ink-muted tabular-nums">{verdicts.notReviewed} not reviewed</span>}
    </span>
  )
}

const DECISION_TAG: Partial<Record<Decision, { tone: 'ok' | 'err'; kind: 'approved' | 'rejected'; label: string }>> = {
  approve: { tone: 'ok', kind: 'approved', label: 'Approve' },
  'request-changes': { tone: 'err', kind: 'rejected', label: 'Request changes' },
}

/** The decision the verdicts point to, as a tag. Nothing while it is undecided. */
function DecisionTag({ decision }: { decision: Decision }) {
  const spec = DECISION_TAG[decision]
  if (!spec) return null
  const Icon = VERDICT_STYLE[spec.kind].icon
  return (
    <Tag tone={spec.tone} size="sm" className="h-[22px]">
      <Icon aria-hidden />
      {spec.label}
    </Tag>
  )
}

interface RailReviewProps {
  summary: SessionSummaryView
  density: RailDensity
  /** The Submit page, linked from the notice when the review is ready (or the last run failed). */
  submitTo: string
}

/**
 * The review state, the same on every page: the verdict-split bar with its counts, the session's
 * status notice and the decision the verdicts suggest. Compact folds the counts beside the bar.
 */
export function RailReview({ summary, density, submitTo }: RailReviewProps) {
  const { detail } = useSessionContext()
  const { status, run, progress, openComments, verdicts, suggestion, lastSend } = summary
  const compact = density === 'compact'
  const link = status === 'ready' ? submitTo : undefined
  return (
    <section aria-label="Review state" data-density={density} className="flex shrink-0 flex-col gap-2 border-b-fine border-line px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <strong className="text-[13.5px] whitespace-nowrap tabular-nums" title={`Reviewed ${progress.reviewed} of ${progress.total}`}>
          {progress.reviewed}/{progress.total}
        </strong>
        <VerdictBar summary={verdicts} className="flex-1" />
        {compact && <VerdictCounts verdicts={verdicts} className="flex-nowrap gap-x-2" />}
      </div>
      {!compact && <VerdictCounts verdicts={verdicts} withRest />}
      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusNotice summary={{ status, run, progress, openComments, lastSend }} to={link} runTo={submitTo} className="min-h-[26px] min-w-0 shrink py-0.5 text-xs [&>[data-slot=notice-icon]]:size-[18px] [&>[data-slot=notice-icon]_svg]:size-2.5" />
        {compact && run !== 'working' && <DecisionTag decision={suggestion} />}
        <StatusLegend className="ml-auto" />
      </div>
      {!isTestRunDetail(detail) && <BranchChangedNotice sessionBranch={detail.manifest.repo.branch} current={detail.tree.branch} />}
      {!compact && run !== 'working' && (
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <span>{status === 'ready' ? 'Decision' : 'Suggested decision'}</span>
          {suggestion === 'undecided' ? <span className="font-medium">none yet</span> : <DecisionTag decision={suggestion} />}
        </div>
      )}
    </section>
  )
}
