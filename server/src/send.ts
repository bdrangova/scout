import { buildSentPrReplies, buildSentSnapshot, buildTestRunSentSnapshot, derivePrComments, emptyReview, isTestRun, renderSentMarkdown, renderTestRunSentMarkdown, stampSent } from '@review-dash/shared'
import type { AgentRun, AnySentSnapshot, Resolutions, Review, SendRequest, SendResponse } from '@review-dash/shared'
import type { AgentAdapter } from './agent/adapter.ts'
import type { RunManager } from './agent/runs.ts'
import { badRequest } from './errors.ts'
import { concatPatches, readJournal, readPrComments, readPrReplies, readPrResolutions } from './store/index.ts'
import type { LoadedSession, Store } from './store/index.ts'

export interface SendDeps {
  store: Store
  runs: RunManager
  adapter: AgentAdapter
  dashboardUrl: string
  now?: () => string
}

/** What one Submit writes: the snapshot, its markdown and (code reviews only) the patch. */
interface Built {
  sent: AnySentSnapshot
  markdown: string
  patch: string | null
}

type Builder = (review: Review, resolutions: Resolutions | null, now: string) => Built

function nothingToSend(sent: AnySentSnapshot, request: SendRequest, extra = 0): void {
  if (sent.comments.length === 0 && extra === 0 && request.decision === 'undecided') {
    throw badRequest('nothing to send: there are no open comments, no PR comment drafts and no decision')
  }
}

async function codeReviewBuilder(deps: SendDeps, session: LoadedSession, request: SendRequest): Promise<Builder> {
  const { store } = deps
  const sessionId = session.id
  const [{ tree, patches }, artifacts] = await Promise.all([store.tree(session), store.artifacts(session)])
  const [prComments, prResolutions, prReplies, journal] = await Promise.all([
    readPrComments(session.dir, sessionId).catch(() => null),
    readPrResolutions(session.dir, sessionId).catch(() => null),
    readPrReplies(session.dir, sessionId).catch(() => null),
    readJournal(session.dir, sessionId),
  ])
  return (review, resolutions, now) => {
    // The user's unposted PR-comment drafts travel with this Submit (instructions for open comments, replies approved to post).
    const prViews = derivePrComments(prComments, prResolutions, now, prReplies)
    const sent = buildSentSnapshot({ review, tree, decision: request.decision, resolutions, prReplies: buildSentPrReplies(prViews), now })
    nothingToSend(sent, request, (sent.prReplies ?? []).length)
    const patch = concatPatches(tree, patches)
    const prContext = prComments === null ? {} : { prComments: { sessionId, pr: prComments.pr, views: prViews } }
    const markdown = renderSentMarkdown(sent, { title: session.manifest.title, dashboardUrl: deps.dashboardUrl, patch, journal, ...artifacts, ...prContext })
    return { sent, markdown, patch }
  }
}

async function testRunBuilder(deps: SendDeps, session: LoadedSession, request: SendRequest): Promise<Builder> {
  const { store } = deps
  const manifest = store.testRun(session)
  const [detail, indexFingerprint] = await Promise.all([store.runDetail(manifest), store.runIndexFingerprint(manifest)])
  const scenarios = detail.scenarios.map(({ id, title, status, fingerprint }) => ({ id, title, status, fingerprint }))
  return (review, resolutions, now) => {
    const sent = buildTestRunSentSnapshot(review, scenarios, request.decision, resolutions, now, { path: manifest.run.path, indexFingerprint })
    nothingToSend(sent, request)
    const markdown = renderTestRunSentMarkdown(sent, { title: manifest.title, dashboardUrl: deps.dashboardUrl, index: detail.index })
    return { sent, markdown, patch: null }
  }
}

/**
 * One Submit: snapshot the open comments, verdicts and decision against the live tree (code review) or the run's scenarios
 * (test run) to `review/sent/<stem>.json|.md` (and `.patch` for a code review), stamp `review.json`, and (with `dispatch`) start the
 * agent or explain why it is pending.
 */
export async function sendReview(deps: SendDeps, sessionId: string, request: SendRequest): Promise<SendResponse> {
  const { store, runs, adapter } = deps
  const session = await store.loadSession(sessionId)
  if (session.manifest.kind === 'pr-review') throw badRequest('PR reviews use copy-only export, not send')
  const build = await (isTestRun(session.manifest) ? testRunBuilder(deps, session, request) : codeReviewBuilder(deps, session, request))
  const written: { sent?: AnySentSnapshot } = {}

  await store.updateReview(sessionId, async (current, resolutions) => {
    const review = current ?? emptyReview(sessionId)
    const now = (deps.now ?? (() => new Date().toISOString()))()
    const { sent, markdown, patch } = build(review, resolutions, now)
    await store.writeSent(session.dir, sent, markdown, patch)
    written.sent = sent
    return stampSent(review, sent, now)
  })
  const { sent } = written
  if (sent === undefined) throw new Error('send did not produce a snapshot')

  let run: AgentRun | null = null
  let pending: { reason: string } | null = null
  if (request.dispatch) {
    const active = runs.activeRun(sessionId)
    if (active) {
      pending = { reason: `run ${active.id} is still active for this session; the new feedback will be picked up by the next run` }
    } else {
      const detail = await store.getSession(sessionId)
      const can = await adapter.canResume(detail, { fork: false })
      if (can.ok) run = await runs.start(detail, { sentAt: sent.sentAt, decision: sent.decision, fork: false })
      else pending = { reason: can.reason }
    }
  }
  return { sent, run, pending }
}
