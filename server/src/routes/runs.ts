import { Router } from 'express'
import { RUN_ID_RE, StartRunRequestSchema } from '@review-dash/shared'
import type { AgentRun, ApiError } from '@review-dash/shared'
import type { AgentAdapter } from '../agent/adapter.ts'
import type { RunManager } from '../agent/runs.ts'
import { formatZodError, notFound } from '../errors.ts'
import type { SseRegistry } from '../sse.ts'
import type { Store } from '../store/index.ts'
import { queryString } from './params.ts'

export interface RunsDeps {
  store: Store
  runs: RunManager
  adapter: AgentAdapter
  sse: SseRegistry
}

function lastEventId(header: string | string[] | undefined, query: string | undefined): number {
  const raw = Array.isArray(header) ? header[0] : (header ?? query)
  const n = raw === undefined ? Number.NaN : Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

async function knownRun(runs: RunManager, runId: string): Promise<AgentRun> {
  const run = RUN_ID_RE.test(runId) ? await runs.get(runId) : null
  if (!run) throw notFound(`run ${runId} not found`)
  return run
}

export function runsRouter(deps: RunsDeps): Router {
  const { store, runs, adapter, sse } = deps
  const router = Router()

  router.get('/sessions/:id/runs', async (req, res) => {
    await store.loadSession(req.params.id)
    res.json(await runs.list(req.params.id))
  })

  router.post('/sessions/:id/runs', async (req, res) => {
    const parsed = StartRunRequestSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      const body: ApiError = { error: `invalid StartRunRequest: ${formatZodError(parsed.error)}` }
      res.status(400).json(body)
      return
    }
    const id = req.params.id
    const detail = await store.getSession(id)
    const { review } = await store.getReview(id)
    if (review.sent === null) {
      const body: ApiError = { error: 'nothing has been sent for this session yet', reason: 'submit the review first' }
      res.status(412).json(body)
      return
    }
    const active = runs.activeRun(id)
    if (active) {
      const body: ApiError = { error: `run ${active.id} is already active for session ${id}` }
      res.status(409).json(body)
      return
    }
    const fork = parsed.data.fork ?? false
    const can = await adapter.canResume(detail, { fork })
    if (!can.ok) {
      const body: ApiError = { error: 'the Claude Code session cannot be resumed', reason: can.reason }
      res.status(412).json(body)
      return
    }
    res.json(await runs.start(detail, { sentAt: review.sent.at, decision: review.sent.decision, fork }))
  })

  router.get('/runs/:runId', async (req, res) => {
    res.json(await knownRun(runs, req.params.runId))
  })

  router.post('/runs/:runId/cancel', async (req, res) => {
    await knownRun(runs, req.params.runId)
    await runs.cancel(req.params.runId)
    res.json({ ok: true })
  })

  router.get('/runs/:runId/events', async (req, res) => {
    await knownRun(runs, req.params.runId)
    const fromSeq = lastEventId(req.headers['last-event-id'], queryString(req.query.lastEventId))
    const stream = sse.open(res)
    const subscription = await runs.subscribe(req.params.runId, fromSeq, {
      onEvent: (event) => stream.send(event, { event: 'run', id: event.seq }),
      onEnd: (run) => {
        stream.send(run, { event: 'end' })
        stream.end()
      },
    })
    if (!subscription) {
      stream.send({ error: `run ${req.params.runId} not found` }, { event: 'error' })
      stream.end()
      return
    }
    stream.onClose(subscription.unsubscribe)
    if (subscription.finished) {
      stream.send(subscription.run, { event: 'end' })
      stream.end()
    }
  })

  return router
}
