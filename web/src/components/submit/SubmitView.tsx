import { ArrowLeftIcon } from 'lucide-react'
import { useContext, type ReactNode } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { SidebarContext } from '@/components/layout/sidebar-context'
import { Button } from '@/components/ui/button'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { useCommentActions } from '@/state/useCommentActions'
import { useSendReview } from '@/state/useSendReview'
import { AgentRunView } from './AgentRunView'
import { ComposeColumn } from './ComposeColumn'
import type { DecisionChoice } from './DecisionPicker'
import { FailedRunNotice } from './FailedRunNotice'
import { OpenComments } from './OpenComments'
import { PreviousRuns } from './PreviousRuns'
import { SendBar } from './SendBar'
import { SubmitRailSection } from './SubmitRailSection'

export interface SubmitViewProps {
  /** The last compose card: the PR description (code review) or the run summary (test run). */
  descriptionPanel: ReactNode
  decisionChoices?: readonly DecisionChoice[]
}

/**
 * The Submit screen shared by both session kinds: decision, overall feedback, the open comments and the description card. The split
 * button sends at once (no confirmation); then the live agent run (or the pending panel) takes the
 * place of the compose cards. `useSendReview` owns the send flow and the `?run=` / `?pending=` URL
 * state; store events are handled by `SessionLiveUpdates` in the layout.
 */
export function SubmitView({ descriptionPanel, decisionChoices }: SubmitViewProps) {
  const { detail } = useSessionContext()
  const { state, comments, saveStatus } = useReview()
  const actions = useCommentActions()
  const send = useSendReview()
  const { selectedRun, failedRun } = send
  // The rail carries the run history while it is open; closed (or outside the shell) the page keeps its own list.
  const railOpen = useContext(SidebarContext)?.open ?? false

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1130px] flex-1 flex-col gap-[18px] px-6 pt-7 pb-14">
        <PageHeader title="Submit" />
        {failedRun && (
          <FailedRunNotice
            run={failedRun}
            onRetry={() => void send.send()}
            onView={() => send.showRun(failedRun)}
            retrying={send.sending}
            blocked={send.sendBlocker !== null}
          />
        )}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-[18px] max-lg:order-2">
            {selectedRun ? (
              <>
                <AgentRunView key={selectedRun.id} run={selectedRun} comments={comments} onRunChange={send.onRunChange} />
                <Button variant="ghost" size="sm" className="self-start" onClick={send.backToReview}>
                  <ArrowLeftIcon aria-hidden />
                  Back to the review
                </Button>
              </>
            ) : (
              <>
                {send.loadingRun && (
                  <p className="text-xs font-medium text-ink-muted" aria-busy="true">
                    Loading run…
                  </p>
                )}
                <ComposeColumn pending={send.pending} onRun={send.showRun} cwd={send.cwd} command={send.command} descriptionPanel={descriptionPanel} decisionChoices={decisionChoices} />
              </>
            )}
            {!railOpen && <PreviousRuns runs={send.runs} selectedId={selectedRun?.id ?? null} onSelect={send.showRun} />}
          </div>
          <div className="flex min-w-0 flex-col gap-[18px]">
            <OpenComments comments={comments} review={state.review} detail={detail} title={selectedRun ? 'Comments' : 'Open comments'} {...actions} />
          </div>
        </div>
      </div>
      <SubmitRailSection comments={comments} review={state.review} detail={detail} runs={send.runs} selectedRunId={selectedRun?.id ?? null} onSelectRun={send.showRun} />
      <SendBar send={send} saveStatus={saveStatus} />
    </main>
  )
}
