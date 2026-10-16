import { buildSentSnapshot, emptyReview, renderSentMarkdown, stampSent } from '@review-dash/shared'
import type { AgentRun, SendRequest, SendResponse, SentSnapshot } from '@review-dash/shared'
import type { AgentAdapter } from './agent/adapter.ts'
import type { RunManager } from './agent/runs.ts'
import { badRequest } from './errors.ts'
import { concatPatches } from './store/index.ts'
import type { Store } from './store/index.ts'

export interface SendDeps {
  store: Store
  runs: RunManager
  adapter: AgentAdapter
  dashboardUrl: string
  now?: () => string
}

/**
 * One Submit: snapshot the open comments, verdicts and decision against the live tree to
 * `review/sent/<stem>.json|.md|.patch`, stamp `review.json`, and (with `dispatch`) start the
 * agent or explain why it is pending.
 */
export async function sendReview(deps: SendDeps, sessionId: string, request: SendRequest): Promise<SendResponse> {
  const { store, runs, adapter } = deps
  const session = await store.loadSession(sessionId)
  const [{ tree, patches }, artifacts] = await Promise.all([store.tree(session), store.artifacts(session)])
  let snapshot: SentSnapshot | null = null

  await store.updateReview(sessionId, async (current, resolutions) => {
    const review = current ?? emptyReview(sessionId)
    const now = (deps.now ?? (() => new Date().toISOString()))()
    const sent = buildSentSnapshot({ review, tree, decision: request.decision, resolutions, now })
    if (sent.comments.length === 0 && request.decision === 'undecided') {
      throw badRequest('nothing to send: there are no open comments and no decision')
    }
    const markdown = renderSentMarkdown(sent, { title: session.manifest.title, dashboardUrl: deps.dashboardUrl, ...artifacts })
    await store.writeSent(session.dir, sent, markdown, concatPatches(tree, patches))
    snapshot = sent
    return stampSent(review, sent, now)
  })
  if (snapshot === null) throw new Error('send did not produce a snapshot')
  const sent: SentSnapshot = snapshot

  let run: AgentRun | null = null
  let pending: { reason: string } | null = null
  if (request.dispatch) {
    const active = runs.activeRun(sessionId)
    if (active) {
      pending = { reason: `run ${active.id} is still active for this session; the new feedback will be picked up by the next run` }
    } else {
      const detail = await store.getSession(sessionId)
      const can = await adapter.canResume(detail, { fork: false })
      if (can.ok) run = await runs.start(detail, { sentAt: sent.sentAt, fork: false })
      else pending = { reason: can.reason }
    }
  }
  return { sent, run, pending }
}
