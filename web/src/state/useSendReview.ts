import type { AgentRun, Decision } from '@scout/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { suggestDecision, suggestTestRunDecision, verdictSummary } from '@/components/submit/verdict-summary'
import { pluralize } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import type { QueuedReplyCounts } from '@/lib/pr-replies'
import {
  DECISION_LABELS,
  SEND_TARGET_LABELS,
  applyReviewCommand,
  type ReviewCommand,
  describeApiError,
  desktopNewSessionUrl,
  isRunActive,
  listRuns,
  sendReview,
  sessionOrigin,
  type SendTarget,
  type SessionOrigin,
} from '@/lib/runs'
import { useSessionContext } from '@/lib/session-context'
import { usePrComments } from './pr-comments-context'
import { useReview } from './review-context'

const RUN_PARAM = 'run'
const PENDING_PARAM = 'pending'
const TARGET_PARAM = 'target'
/** `?pending=` value when the feedback was written without asking the server for a run. */
const PENDING_SAVED = 'saved'

export interface PendingState {
  /** The server's reason for not starting a run; null when none was asked for. */
  reason: string | null
  mode: SendTarget
}

export interface SendReviewState {
  /** The directory the agent works in (the repo, or a test run's checkout) and the slash command it is given. */
  cwd: string
  command: ReviewCommand
  origin: SessionOrigin
  /** Whether "Current session" is a possible target (a Desktop session needs a recorded id). */
  canContinue: boolean
  target: SendTarget
  setTarget: (target: SendTarget) => void
  /** Every run of the session, the streamed final copy winning over the list's. */
  runs: AgentRun[]
  /** The run shown in place of the compose column (`?run=`), when there is one. */
  selectedRun: AgentRun | null
  /** A run is selected in the URL but the list has not arrived yet. */
  loadingRun: boolean
  /** The feedback was written but no headless run started (`?pending=`). */
  pending: PendingState | null
  agentWorking: boolean
  sending: boolean
  sendError: string | null
  /** The latest run when it failed (and nothing is running): Submit shows it at the top with a retry. */
  failedRun: AgentRun | null
  /** `Send 1 comment + Request changes to the current session · 11 files not reviewed`; null until a decision exists. */
  sendSummary: string | null
  /** Why the send button is off, when it is. */
  sendBlocker: string | null
  send: () => Promise<void>
  showRun: (run: AgentRun) => void
  /** Called by the run view with the final run: refreshes the list and the review's resolutions. */
  onRunChange: (run: AgentRun) => void
  backToReview: () => void
}

function describeSend(input: {
  openComments: number
  queued: QueuedReplyCounts
  decision: Decision
  target: SendTarget
  notReviewed: number
  /** Test runs word the decision as Accept / Changes requested and count scenarios, not files. */
  testRun: boolean
}): string {
  const items: string[] = []
  if (input.openComments > 0 || (input.queued.instructions === 0 && input.queued.replies === 0)) {
    items.push(input.openComments === 0 ? 'no comments' : pluralize(input.openComments, 'comment'))
  }
  if (input.queued.instructions > 0) items.push(pluralize(input.queued.instructions, 'PR instruction'))
  if (input.queued.replies > 0) items.push(pluralize(input.queued.replies, 'PR reply', 'PR replies'))
  if (input.decision !== 'undecided') items.push(input.testRun ? TEST_RUN_DECISION_LABELS[input.decision] : DECISION_LABELS[input.decision])
  const parts = [`Send ${items.join(' + ')} to the ${SEND_TARGET_LABELS[input.target].toLowerCase()}`]
  if (input.notReviewed > 0) parts.push(`${pluralize(input.notReviewed, input.testRun ? 'scenario' : 'file')} not reviewed`)
  return parts.join(' · ')
}

const TEST_RUN_DECISION_LABELS: Record<Exclude<Decision, 'undecided'>, string> = {
  approve: 'Accept',
  'request-changes': 'Changes requested',
  reject: DECISION_LABELS.reject,
}

type ParamsPatch = (next: URLSearchParams) => void

/**
 * The send flow of the Submit page: the target choice, the send call, the run list and the URL
 * state (`?run=` for the selected run, `?pending=`/`?target=` for a send without a run) that
 * survives a review reload.
 */
export function useSendReview(): SendReviewState {
  const { sessionId, detail, reload: reloadDetail } = useSessionContext()
  const testRun = detail.kind === 'test-run'
  // The agent works in the repo (code review) or the checkout (test run); sent feedback is applied with that kind's command.
  const cwd = detail.kind === 'test-run' ? detail.manifest.run.repo : detail.manifest.repo.path
  const command: ReviewCommand = testRun ? '/apply-test-review' : '/apply-review'
  const activeRunId = detail.activeRunId ?? null
  const { state, items, comments, dispatch, flushSave, reload: reloadReview } = useReview()
  const { queued, flushReplies } = usePrComments()
  const decision = state.review.overall.decision
  const [params, setParams] = useSearchParams()
  // The runs list follows the session detail, which `SessionLiveUpdates` reloads on `run.updated`.
  const runList = useAsync(`runs:${sessionId}:${activeRunId ?? 'none'}`, () => listRuns(sessionId))
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
  const pending = useMemo<PendingState | null>(
    () =>
      pendingParam === null
        ? null
        : { reason: pendingParam === PENDING_SAVED ? null : pendingParam, mode: params.get(TARGET_PARAM) === 'new' ? 'new' : 'current' },
    [pendingParam, params],
  )
  const selectedRunId = runParam === 'none' ? null : (runParam ?? activeRunId)

  const runs = useMemo(() => {
    // The final run from the event stream may be newer than the list's copy of it.
    const byId: Record<string, AgentRun> = { ...knownRuns }
    for (const run of runList.data ?? []) {
      const known = byId[run.id]
      byId[run.id] = known && known.endedAt && !run.endedAt ? known : run
    }
    return Object.values(byId)
  }, [knownRuns, runList.data])
  const selectedRun = selectedRunId ? (runs.find((run) => run.id === selectedRunId) ?? null) : null
  const agentWorking = runs.some((run) => isRunActive(run.status))

  const openComments = comments.filter((comment) => comment.status === 'open').length
  const files = verdictSummary(state.review, { files: items })
  const latestRun = runs.reduce<AgentRun | null>((latest, run) => (latest === null || Date.parse(run.startedAt) > Date.parse(latest.startedAt) ? run : latest), null)
  const failedRun = !agentWorking && latestRun?.status === 'failed' ? latestRun : null
  // PR instructions and replies can go out on their own, without a decision (the server accepts it).
  const draftsOnly = queued.instructions + queued.replies > 0
  const sendBlocker = agentWorking
    ? 'Wait for the current run to finish'
    : items.length === 0 && !draftsOnly
      ? testRun
        ? 'No scenarios to review'
        : 'Nothing to review'
      : decision === 'undecided' && !draftsOnly
        ? 'Pick a decision first'
        : null
  const sendSummary = decision === 'undecided' && !draftsOnly ? null : describeSend({ openComments, queued, decision, target, notReviewed: files.notReviewed, testRun })

  // Pre-select the decision the verdicts point to, once per visit; the reviewer can change it.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current) return
    preselected.current = true
    if (decision !== 'undecided' || state.review.overall.cleared) return
    const suggestion = testRun ? suggestTestRunDecision(files, openComments) : suggestDecision(files)
    if (suggestion !== 'undecided') dispatch({ type: 'SET_DECISION', decision: suggestion })
  }, [decision, state.review.overall.cleared, files, dispatch, testRun, openComments])

  const patchParams = useCallback(
    (patch: ParamsPatch) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          patch(next)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const showRun = useCallback(
    (run: AgentRun) => {
      setKnownRuns((known) => ({ ...known, [run.id]: run }))
      patchParams((next) => {
        next.set(RUN_PARAM, run.id)
        next.delete(PENDING_PARAM)
        next.delete(TARGET_PARAM)
      })
    },
    [patchParams],
  )

  const backToReview = useCallback(() => patchParams((next) => next.set(RUN_PARAM, 'none')), [patchParams])

  const reloadRuns = runList.reload
  const onRunChange = useCallback(
    (run: AgentRun) => {
      setKnownRuns((known) => ({ ...known, [run.id]: run }))
      reloadRuns()
      reloadReview()
    },
    [reloadRuns, reloadReview],
  )

  const send = useCallback(async () => {
    setSending(true)
    setSendError(null)
    // A Desktop session never gets a headless run by default: `claude -p --resume` would write into
    // the transcript the user has open. CLI and unknown origins keep the headless resume.
    const dispatch = target === 'current' && origin !== 'desktop'
    try {
      // The server snapshots the review on disk: every comment shown must be saved first.
      // A reply typed a moment ago is still in its box's debounce: save it too, or it is not in the snapshot.
      const [reviewSaved, repliesSaved] = await Promise.all([flushSave(), flushReplies()])
      if (!reviewSaved || !repliesSaved) {
        setSendError("Your latest changes couldn't be saved, so nothing was sent. Check the comments below and send again.")
        return
      }
      const response = await sendReview(sessionId, decision, { dispatch })
      if (response.run) showRun(response.run)
      else {
        patchParams((next) => {
          next.set(PENDING_PARAM, response.pending?.reason ?? PENDING_SAVED)
          next.set(TARGET_PARAM, target)
        })
        if (origin === 'desktop' && target === 'current') {
          await navigator.clipboard.writeText(applyReviewCommand(sessionId, command)).catch(() => undefined)
        }
        if (origin === 'desktop' && target === 'new') {
          // May be blocked after the await; the pending panel repeats the link.
          window.location.assign(desktopNewSessionUrl(cwd, sessionId, command))
        }
      }
      reloadReview()
      reloadDetail()
    } catch (reason: unknown) {
      setSendError(describeApiError(reason))
    } finally {
      setSending(false)
    }
  }, [target, origin, sessionId, decision, flushSave, flushReplies, showRun, patchParams, cwd, command, reloadReview, reloadDetail])

  return {
    cwd,
    command,
    origin,
    canContinue,
    target,
    setTarget,
    runs,
    selectedRun,
    loadingRun: selectedRunId !== null && selectedRun === null && runList.loading,
    pending,
    agentWorking,
    sending,
    sendError,
    failedRun,
    sendSummary,
    sendBlocker,
    send,
    showRun,
    onRunChange,
    backToReview,
  }
}
