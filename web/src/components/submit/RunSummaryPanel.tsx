import type { TestRunDetail } from '@review-dash/shared'
import { Markdown } from '@/components/common/Markdown'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { runSummaryMarkdown } from './run-summary'

/** The test run's last compose card, where a code review shows its PR description: the run summary, or the title with its feature and area. */
export function RunSummaryPanel({ detail }: { detail: TestRunDetail }) {
  const summary = runSummaryMarkdown(detail.index)
  const where = [detail.index.feature, detail.index.area].filter((part): part is string => part !== null).join(' · ')
  return (
    <Panel role="region" aria-label="Run summary">
      <PanelHeader>
        <PanelTitle>{summary?.title ?? 'Run summary'}</PanelTitle>
      </PanelHeader>
      <PanelBody>
        {summary ? (
          <Markdown source={summary.markdown} variant="untrusted" />
        ) : (
          <p className="text-[13px] font-medium text-ink-muted">
            <span className="font-bold text-ink">{detail.index.title}</span>
            {where && ` · ${where}`}
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
