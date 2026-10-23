import type { ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { BranchRef } from '@/components/common/BranchRef'
import { PrReportSummary } from '@/components/prreview/ReportNotice'
import { DiffStats } from '@/components/session/DiffStats'
import { TicketStrip } from '@/components/session/TicketStrip'
import { baseTooltip } from '@/lib/branch-tooltip'
import { repoName } from '@/lib/paths'
import { isTestRunDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { CompactIdentity, DensityButton } from './DensityButton'
import { TestRunIdentity } from './TestRunIdentity'
import type { RailDensity } from './useRailDensity'

interface RailIdentityProps {
  density: RailDensity
  onToggleDensity: () => void
}

function BranchLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="w-[38px] shrink-0 text-[10.5px] font-bold tracking-[.08em] text-ink-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

/**
 * Who this review is about: tickets, title, repository and the two branches (roomy), or the title
 * alone on one line (compact). The chevron switches; the rail remembers the choice (`useRailDensity`).
 */
export function RailIdentity({ density, onToggleDensity }: RailIdentityProps) {
  const { detail } = useSessionContext()
  if (isTestRunDetail(detail)) return <TestRunIdentity detail={detail} density={density} onToggleDensity={onToggleDensity} />
  const { manifest, tree } = detail
  const branch = tree.branch ?? manifest.repo.branch
  const baseRef = tree.baseRef || manifest.repo.baseRef

  if (density === 'compact') {
    return <CompactIdentity title={manifest.title} onClick={onToggleDensity} />
  }
  return (
    <div data-density="roomy" className="shrink-0 border-b-fine border-line px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <DensityButton density={density} onClick={onToggleDensity} />
        <TicketStrip tickets={manifest.tickets} className="flex-1" />
      </div>
      <h2 className="m-0 mt-2 mb-1.5 line-clamp-2 text-[15px] leading-5 font-bold" title={manifest.title}>
        {manifest.title}
      </h2>
      <div className="mb-1.5 flex items-center gap-2 font-mono text-xs leading-[18px] font-medium">
        <span
          className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap"
          title={`Repository: ${manifest.repo.path}`}
          aria-label={`Repository ${repoName(manifest.repo.path)}`}
        >
          <Folder className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{repoName(manifest.repo.path)}</span>
        </span>
        <DiffStats additions={tree.stats.additions} deletions={tree.stats.deletions} files={tree.stats.files} className="ml-auto text-xs" />
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <BranchLine label="into">
          <BranchRef name={baseRef} title={baseTooltip(tree.baseSha, tree.baseVirtual)} className="max-w-full min-w-0" />
        </BranchLine>
        <BranchLine label="from">
          <BranchRef name={branch} className="max-w-full min-w-0" />
        </BranchLine>
      </div>
      <PrReportSummary />
    </div>
  )
}
