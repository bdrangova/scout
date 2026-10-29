import type { ReactNode } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { useCommentActions } from '@/state/useCommentActions'
import { useSendReview } from '@/state/useSendReview'
import { ComposeColumn } from './ComposeColumn'
import type { DecisionChoice } from './DecisionPicker'
import { OpenComments } from './OpenComments'
import { SendBar } from './SendBar'
import { SubmitRailSection } from './SubmitRailSection'

export interface SubmitViewProps {
  /** The last compose card: the PR description (code review) or the run summary (test run). */
  descriptionPanel: ReactNode
  decisionChoices?: readonly DecisionChoice[]
}

/**
 * The Submit screen shared by both session kinds: decision, overall feedback, the open comments and the description card. The split
 * button sends at once (no confirmation); then the pending panel shows how Claude Code picks the
 * feedback up. `useSendReview` owns the send flow and the `?pending=` URL state; store events are handled by `SessionLiveUpdates` in the layout.
 */
export function SubmitView({ descriptionPanel, decisionChoices }: SubmitViewProps) {
  const { detail } = useSessionContext()
  const { state, comments, saveStatus } = useReview()
  const actions = useCommentActions()
  const send = useSendReview()

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1130px] flex-1 flex-col gap-[18px] px-6 pt-7 pb-14">
        <PageHeader title="Submit" />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-[18px] max-lg:order-2">
            <ComposeColumn pending={send.pending} cwd={send.cwd} command={send.command} descriptionPanel={descriptionPanel} decisionChoices={decisionChoices} />
          </div>
          <div className="flex min-w-0 flex-col gap-[18px]">
            <OpenComments comments={comments} review={state.review} detail={detail} {...actions} />
          </div>
        </div>
      </div>
      <SubmitRailSection comments={comments} review={state.review} detail={detail} />
      <SendBar send={send} saveStatus={saveStatus} />
    </main>
  )
}
