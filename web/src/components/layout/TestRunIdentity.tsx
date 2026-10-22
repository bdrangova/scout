import type { TestRunDetail } from '@review-dash/shared'
import { Folder } from 'lucide-react'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Tag } from '@/components/ui/tag'
import { repoName, shortRunPath } from '@/lib/paths'
import { DensityButton } from './DensityButton'
import type { RailDensity } from './useRailDensity'

interface TestRunIdentityProps {
  detail: TestRunDetail
  density: RailDensity
  onToggleDensity: () => void
}

/** `RailIdentity` of a test run: tickets, title, the run folder (shortened), then feature and area. Compact: the title alone. */
export function TestRunIdentity({ detail, density, onToggleDensity }: TestRunIdentityProps) {
  const { manifest } = detail
  const { run } = manifest
  const subject = [run.feature, run.area].filter((part): part is string => part !== null && part !== '').join(' · ')

  if (density === 'compact') {
    return (
      <div data-density="compact" className="flex h-[41px] shrink-0 items-center gap-1 border-b-fine border-line px-2">
        <DensityButton density={density} onClick={onToggleDensity} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" title={manifest.title}>
          {manifest.title}
        </span>
      </div>
    )
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
      {subject !== '' && (
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink-muted" data-slot="run-subject">
          <Tag tone="info" size="sm">
            Test run
          </Tag>
          <span className="truncate" title={subject}>
            {subject}
          </span>
        </div>
      )}
      <div
        className="flex min-w-0 items-center gap-1 font-mono text-xs leading-[18px] font-medium"
        title={`Run folder: ${run.path}`}
        aria-label={`Run folder ${shortRunPath(run)} in ${repoName(run.repo)}`}
      >
        <Folder className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{shortRunPath(run)}</span>
      </div>
    </div>
  )
}
