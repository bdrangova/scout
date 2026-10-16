import { SESSION_PR_DESCRIPTION_FILE, type AgentRun } from '@review-dash/shared'
import { ArrowRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Markdown } from '@/components/common/Markdown'
import { AgentRunView } from '@/components/submit/AgentRunView'
import { DecisionPicker } from '@/components/submit/DecisionPicker'
import { OpenComments } from '@/components/submit/OpenComments'
import { OverallComment } from '@/components/submit/OverallComment'
import { PendingPanel } from '@/components/submit/PendingPanel'
import { PreviousRuns } from '@/components/submit/PreviousRuns'
import { SendTargetMenu } from '@/components/submit/SendTargetMenu'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/lib/hooks'
import {
  SEND_TARGET_LABELS,
  applyReviewCommand,
  describeApiError,
  desktopNewSessionUrl,
  isRunActive,
  listRuns,
  sendReview,
  sessionOrigin,
  type SendTarget,
} from '@/lib/runs'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

const RUN_PARAM = 'run'
const PENDING_PARAM = 'pending'
const TARGET_PARAM = 'target'
/** `?pending=` value when the feedback was written without asking the server for a run. */
const PENDING_SAVED = 'saved'

/**
 * The Submit page: decision, overall feedback, the open comments and the PR description. The split
 * button sends at once (no confirmation); then the live agent run (or the pending panel) takes the
 * place of the compose cards. The selected run lives in `?run=` so it survives a review reload (which remounts this page). Store
 * events are handled by `SessionLiveUpdates` in the layout.
 */
export function SubmitPage() {
  const { sessionId, detail, reload: reloadDetail } = useSessionContext()
  const { state, dispatch, comments, saveStatus, reload: reloadReview } = useReview()
  // The runs list follows the session detail, which `SessionLiveUpdates` reloads on `run.updated`.
  const review = state.review
  const decision = review.overall.decision
  const [params, setParams] = useSearchParams()
  const runs = useAsync(`runs:${sessionId}:${detail.activeRunId ?? 'none'}`, () => listRuns(sessionId))
  const [knownRuns, setKnownRuns] = useState<Record<string, AgentRun>>({})
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const agent = detail.manifest.agent
  const origin = sessionOrigin(agent)
  // A Desktop session without a recorded id has nothing to pick the feedback up; for CLI and
  // unknown origins the server still decides (headless resume, or its `pending` reason).
  const canContinue = origin !== 'desktop' || agent.sessionId !== null
  // Reset on every visit on purpose: the choice is per send, not a preference.
  const [target, setTarget] = useState<SendTarget>(canContinue ? 'current' : 'new')

  const runParam = params.get(RUN_PARAM)
  const pendingParam = params.get(PENDING_PARAM)
  const pendingMode: SendTarget = params.get(TARGET_PARAM) === 'new' ? 'new' : 'current'
  const selectedRunId = runParam === 'none' ? null : (runParam ?? detail.activeRunId)
  const allRuns = useMemo(() => {
    // The final run from the event stream may be newer than the list's copy of it.
    const byId: Record<string, AgentRun> = { ...knownRuns }
    for (const run of runs.data ?? []) {
      const known = byId[run.id]
      byId[run.id] = known && known.endedAt && !run.endedAt ? known : run
    }
    return Object.values(byId)
  }, [knownRuns, runs.data])
  const selectedRun = selectedRunId ? (allRuns.find((run) => run.id === selectedRunId) ?? null) : null
  const agentWorking = allRuns.some((run) => isRunActive(run.status))

  const openComments = comments.filter((comment) => comment.status === 'open')
  const overall = openComments.find((comment) => comment.target.kind === 'overall') ?? null
  const nothingToSend = openComments.length === 0 && decision === 'undecided'
  // Why the send button is off, when it is: the reviewer should not have to guess.
  const sendBlocker = agentWorking ? 'Wait for the current run to finish' : nothingToSend ? 'Pick a decision or leave a comment first' : null

  const reloadRuns = runs.reload

  const showRun = useCallback(
    (run: AgentRun) => {
      setKnownRuns((known) => ({ ...known, [run.id]: run }))
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set(RUN_PARAM, run.id)
          next.delete(PENDING_PARAM)
          next.delete(TARGET_PARAM)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  function setParam(name: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )
  }

  const onRunChange = useCallback(
    (run: AgentRun) => {
      setKnownRuns((known) => ({ ...known, [run.id]: run }))
      reloadRuns()
      reloadReview()
    },
    [reloadRuns, reloadReview],
  )

  function showPending(reason: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set(PENDING_PARAM, reason ?? PENDING_SAVED)
        next.set(TARGET_PARAM, target)
        return next
      },
      { replace: true },
    )
  }

  async function send() {
    setSending(true)
    setSendError(null)
    // A Desktop session never gets a headless run by default: `claude -p --resume` would write into
    // the transcript the user has open. CLI and unknown origins keep the headless resume.
    const dispatch = target === 'current' && origin !== 'desktop'
    try {
      const response = await sendReview(sessionId, decision, { dispatch })
      if (response.run) showRun(response.run)
      else {
        showPending(response.pending?.reason ?? null)
        if (origin === 'desktop' && target === 'current') {
          await navigator.clipboard.writeText(applyReviewCommand(sessionId)).catch(() => undefined)
        }
        if (origin === 'desktop' && target === 'new') {
          // May be blocked after the await; the pending panel repeats the link.
          window.location.assign(desktopNewSessionUrl(detail.manifest.repo.path, sessionId))
        }
      }
      reloadReview()
      reloadDetail()
    } catch (reason: unknown) {
      setSendError(describeApiError(reason))
    } finally {
      setSending(false)
    }
  }

  const commentHandlers = {
    onEdit: (id: string, body: string) => dispatch({ type: 'EDIT_COMMENT', id, body }),
    onDelete: (id: string) => dispatch({ type: 'DELETE_COMMENT', id }),
    onResolve: (id: string) => dispatch({ type: 'RESOLVE_COMMENT', id }),
    onReopen: (id: string) => dispatch({ type: 'REOPEN_COMMENT', id }),
  }


  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-6 pt-5 pb-6">
        <h2 className="text-lg font-semibold">Submit</h2>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {selectedRun ? (
              <>
                <AgentRunView key={selectedRun.id} run={selectedRun} comments={comments} onRunChange={onRunChange} />
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setParam(RUN_PARAM, 'none')}>
                  Back to the review
                </Button>
              </>
            ) : (
              <>
                {selectedRunId && runs.loading && (
                  <p className="text-xs text-muted-foreground" aria-busy="true">
                    Loading run…
                  </p>
                )}
                {pendingParam && (
                  <PendingPanel
                    sessionId={sessionId}
                    repoPath={detail.manifest.repo.path}
                    mode={pendingMode}
                    reason={pendingParam === PENDING_SAVED ? null : pendingParam}
                    onRun={showRun}
                  />
                )}
                <Card title="Overall feedback">
                  <OverallComment
                    comment={overall}
                    onAdd={(body) => dispatch({ type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body })}
                    onEdit={commentHandlers.onEdit}
                    onDelete={commentHandlers.onDelete}
                  />
                </Card>
                <Card title="Decision">
                  <DecisionPicker value={decision} onChange={(next) => dispatch({ type: 'SET_DECISION', decision: next })} />
                </Card>
                <Card
                  title="PR description"
                  aside={<span className="font-mono text-xs text-muted-foreground">{SESSION_PR_DESCRIPTION_FILE}</span>}
                >
                  {detail.prDescription ? (
                    <Markdown source={detail.prDescription} />
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      None yet: the agent writes <code className="font-mono">{SESSION_PR_DESCRIPTION_FILE}</code> into the session folder.
                    </p>
                  )}
                </Card>
              </>
            )}
            <PreviousRuns runs={allRuns} selectedId={selectedRun?.id ?? null} onSelect={showRun} />
          </div>
          <OpenComments
            comments={comments}
            review={review}
            detail={detail}
            title={selectedRun ? 'Comments' : 'Open comments'}
            {...commentHandlers}
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex min-h-14 items-center gap-3 border-t bg-card px-6 py-2">
        {agentWorking && (
          <span className="flex items-center gap-2.5 text-[13px] font-semibold" aria-live="polite">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-info" aria-hidden />
            Claude Code is working
          </span>
        )}
        {sendError && (
          <span role="alert" className="text-[13px] text-reject">
            {sendError}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {saveStatus === 'saving' && <span className="text-xs text-muted-foreground">Saving…</span>}
          {saveStatus === 'error' && (
            <span role="status" className="text-xs text-reject">
              Draft not saved
            </span>
          )}
          {sendBlocker && !sending && <span className="text-xs text-muted-foreground">{sendBlocker}</span>}
          <div className="flex" data-slot="button-group">
            <Button className="rounded-r-none" onClick={send} disabled={sendBlocker !== null || sending} aria-busy={sending}>
              {sending ? 'Sending…' : `Submit & send to ${SEND_TARGET_LABELS[target].toLowerCase()}`}
              <ArrowRight data-icon="inline-end" />
            </Button>
            <SendTargetMenu value={target} onChange={setTarget} canContinue={canContinue} disabled={sendBlocker !== null || sending} />
          </div>
        </div>
      </div>

    </main>
  )
}


function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="flex items-center gap-2.5 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  )
}
