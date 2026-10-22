import { SESSION_PR_DESCRIPTION_FILE } from '@review-dash/shared'
import { FileTextIcon } from 'lucide-react'
import { Markdown } from '@/components/common/Markdown'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { useCodeReviewDetail } from '@/lib/detail-kind'

/** The code review's last compose card: `pr-description.md` from the session folder. */
export function PrDescriptionPanel() {
  const detail = useCodeReviewDetail()
  return (
    <Panel role="region" aria-label="PR description">
      <PanelHeader>
        <PanelTitle>PR description</PanelTitle>
        <Tag mono className="ml-auto">
          <FileTextIcon aria-hidden />
          {SESSION_PR_DESCRIPTION_FILE}
        </Tag>
      </PanelHeader>
      <PanelBody>
        {detail.prDescription ? (
          <Markdown source={detail.prDescription} />
        ) : (
          <p className="text-[13px] font-medium text-ink-muted">
            None yet: the agent writes <code className="font-mono">{SESSION_PR_DESCRIPTION_FILE}</code> into the session folder.
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
