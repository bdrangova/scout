import type { ReactNode } from 'react'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { useCommentActions } from '@/state/useCommentActions'
import type { PendingState } from '@/state/useSendReview'
import type { ReviewCommand } from '@/lib/runs'
import { DecisionPicker, type DecisionChoice } from './DecisionPicker'
import { OverallComment } from './OverallComment'
import { PendingPanel } from './PendingPanel'

export interface ComposeColumnProps {
  pending: PendingState | null
  /** The agent's working directory and the slash command it is given (for the pending panel's Desktop link). */
  cwd: string
  command: ReviewCommand
  /** The last card: the PR description of a code review, the run summary of a test run. */
  descriptionPanel: ReactNode
  /** Wording of the decision cards; the standard three when absent. */
  decisionChoices?: readonly DecisionChoice[]
}

/** The compose side of Submit: the pending notice (after a send), overall feedback, decision and the description card. */
export function ComposeColumn({ pending, cwd, command, descriptionPanel, decisionChoices }: ComposeColumnProps) {
  const { sessionId } = useSessionContext()
  const { state, dispatch, comments } = useReview()
  const { onEdit, onDelete } = useCommentActions()
  const overall = comments.find((comment) => comment.status === 'open' && comment.target.kind === 'overall') ?? null

  return (
    <>
      {pending && <PendingPanel sessionId={sessionId} repoPath={cwd} command={command} mode={pending.mode} />}
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
          <DecisionPicker choices={decisionChoices} value={state.review.overall.decision} onChange={(next) => dispatch({ type: 'SET_DECISION', decision: next })} />
        </PanelBody>
      </Panel>
      {descriptionPanel}
    </>
  )
}
