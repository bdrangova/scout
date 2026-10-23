import { VerdictBar } from '@/components/session/VerdictBar'
import type { VerdictSummary } from '@/components/submit/verdict-summary'
import { VERDICT_STYLE, type VerdictKind } from '@/lib/verdict'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { BranchChangedNotice } from './BranchChangedNotice'
import type { SessionSummaryView } from './useSessionSummary'
import type { RailDensity } from './useRailDensity'

const COUNTS: readonly { kind: Exclude<VerdictKind, 'none'>; key: 'approved' | 'rejected' | 'commented'; label: string }[] = [
  { kind: 'approved', key: 'approved', label: 'approved' },
  { kind: 'rejected', key: 'rejected', label: 'rejected' },
  { kind: 'commented', key: 'commented', label: 'commented' },
]

function VerdictCounts({ verdicts, className }: { verdicts: VerdictSummary; className?: string }) {
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
    </span>
  )
}

interface RailReviewProps {
  summary: SessionSummaryView
  density: RailDensity
}

/** The review state, the same on every page: progress, the verdict-split bar and its counts. */
export function RailReview({ summary, density }: RailReviewProps) {
  const { detail } = useSessionContext()
  const { progress, verdicts } = summary
  return (
    <section aria-label="Review state" data-density={density} className="mt-auto flex shrink-0 flex-col gap-2 border-t-fine border-line px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <strong className="text-[13.5px] whitespace-nowrap tabular-nums" title={`Reviewed ${progress.reviewed} of ${progress.total}`}>
          {progress.reviewed}/{progress.total}
        </strong>
        <VerdictBar summary={verdicts} className="flex-1" />
        <VerdictCounts verdicts={verdicts} className="flex-nowrap gap-x-2" />
      </div>
      {!isTestRunDetail(detail) && <BranchChangedNotice sessionBranch={detail.manifest.repo.branch} current={detail.tree.branch} />}
    </section>
  )
}
