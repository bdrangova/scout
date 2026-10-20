import { SESSION_PR_DESCRIPTION_FILE } from '@review-dash/shared'
import { FileTextIcon } from 'lucide-react'
import { Markdown } from '@/components/common/Markdown'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { useCommentActions } from '@/state/useCommentActions'
import type { PendingState, SendReviewState } from '@/state/useSendReview'
import { DecisionPicker } from './DecisionPicker'
import { OverallComment } from './OverallComment'
import { PendingPanel } from './PendingPanel'

export interface ComposeColumnProps {
  pending: PendingState | null
  onRun: SendReviewState['showRun']
}

/** The compose side of Submit: the pending notice (after a send without a run), overall feedback, decision and PR description. */
export function ComposeColumn({ pending, onRun }: ComposeColumnProps) {
  const { sessionId, detail } = useSessionContext()
  const { state, dispatch, comments } = useReview()
  const { onEdit, onDelete } = useCommentActions()
  const overall = comments.find((comment) => comment.status === 'open' && comment.target.kind === 'overall') ?? null

  return (
    <>
      {pending && <PendingPanel sessionId={sessionId} repoPath={detail.manifest.repo.path} mode={pending.mode} reason={pending.reason} onRun={onRun} />}
      <Panel role="region" aria-label="Overall feedback">
        <PanelHeader>
          <PanelTitle>Overall feedback</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <OverallComment
            comment={overall}
            onAdd={(body) => dispatch({ type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body })}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </PanelBody>
      </Panel>
      <Panel role="region" aria-label="Decision">
        <PanelHeader>
          <PanelTitle>Decision</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <DecisionPicker value={state.review.overall.decision} onChange={(next) => dispatch({ type: 'SET_DECISION', decision: next })} />
        </PanelBody>
      </Panel>
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
    </>
  )
}
