import fs from 'node:fs'
import path from 'node:path'
import { AgentRunSchema } from '@scout/shared'
import type { Review } from '@scout/shared'
import { makeComment, makeReview } from '@scout/shared/testing/fixtures'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClaudeCodeAdapter } from '../agent/claude-code.ts'
import { appServices, closeApp, createApp } from '../app.ts'
import { loadConfig } from '../config.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

function draft(): Review {
  return makeReview({ sessionId: FIXTURE_SESSION_ID, comments: [makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' } })] })
}

const url = `/api/sessions/${FIXTURE_SESSION_ID}`

describe('run routes with the fake adapter', () => {
  let store: FixtureStore
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    store = await createFixtureStore()
    app = appFor(store.home, { fake: { delayMs: 5 } })
  })
  afterAll(async () => {
    await closeApp(app)
    await store.cleanup()
  })

  it('requires a previous send, then starts one run at a time', async () => {
    expect((await request(app).get(`${url}/runs`)).body).toEqual([])
    const early = await request(app).post(`${url}/runs`).send({})
    expect(early.status).toBe(412)
    expect(early.body).toEqual({ error: expect.stringMatching(/nothing has been sent/), reason: expect.any(String) })

    expect((await request(app).put(`${url}/review`).send({ review: draft(), baseUpdatedAt: null })).status).toBe(200)
    expect((await request(app).post(`${url}/review/send`).send({ decision: 'request-changes', dispatch: false })).status).toBe(200)

    expect((await request(app).post(`${url}/runs`).send({ fork: 'yes' })).status).toBe(400)

    const started = await request(app).post(`${url}/runs`)
    expect(started.status).toBe(200)
    const run = AgentRunSchema.parse(started.body)
    expect(run.status).toBe('running')

    const conflict = await request(app).post(`${url}/runs`).send({})
    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toContain(run.id)

    const list = await request(app).get(`${url}/runs`)
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([run.id])
    expect((await request(app).get(`/api/runs/${run.id}`)).body.id).toBe(run.id)

    const cancel = await request(app).post(`/api/runs/${run.id}/cancel`)
    expect(cancel.body).toEqual({ ok: true })
    const final = await appServices(app).runs.wait(run.id)
    expect(final?.status).toBe('cancelled')
    expect((await request(app).get(`/api/runs/${run.id}`)).body.status).toBe('cancelled')
    expect((await request(app).post(`/api/runs/${run.id}/cancel`)).body).toEqual({ ok: true })
  })

  it('answers 404 for unknown or malformed run ids', async () => {
    for (const id of ['run-20990101000000-ffff', 'nope', '..']) {
      expect((await request(app).get(`/api/runs/${id}`)).status, id).toBe(404)
      expect((await request(app).post(`/api/runs/${id}/cancel`)).status, id).toBe(404)
      expect((await request(app).get(`/api/runs/${id}/events`)).status, id).toBe(404)
    }
  })
})

describe('run routes with the claude-code adapter', () => {
  let store: FixtureStore
  beforeAll(async () => {
    store = await createFixtureStore()
  })
  afterAll(() => store.cleanup())

  async function prepare(app: ReturnType<typeof createApp>): Promise<void> {
    const put = await request(app).put(`${url}/review`).send({ review: draft(), baseUpdatedAt: null })
    expect(put.status).toBe(200)
    expect((await request(app).post(`${url}/review/send`).send({ decision: 'request-changes', dispatch: false })).status).toBe(200)
  }

  it('answers 412 with the reason when the session has no Claude Code session id', async () => {
    const manifestFile = path.join(store.dir, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as { agent: { sessionId: string | null } }
    manifest.agent.sessionId = null
    fs.writeFileSync(manifestFile, JSON.stringify(manifest))

    const app = createApp(
      loadConfig({ AI_REVIEW_HOME: store.home, AGENT_ADAPTER: 'claude-code', AI_REVIEW_CLAUDE_BIN: '/nonexistent/claude', PATH: '' }),
      { log: () => undefined },
    )
    try {
      expect(appServices(app).adapter.kind).toBe('claude-code')
      await prepare(app)
      const res = await request(app).post(`${url}/runs`).send({})
      expect(res.status).toBe(412)
      expect(res.body).toEqual({ error: expect.stringMatching(/cannot be resumed/), reason: expect.stringMatching(/session id/) })
      expect((await request(app).get(`${url}/runs`)).body).toEqual([])

      const dispatched = await request(app).post(`${url}/review/send`).send({ decision: 'request-changes', dispatch: true })
      expect(dispatched.status).toBe(200)
      expect(dispatched.body.run).toBeNull()
      expect(dispatched.body.pending.reason).toMatch(/session id/)
    } finally {
      await closeApp(app)
    }
  })

  it('answers 412 when the claude binary is missing', async () => {
    const app = appFor(store.home, { adapter: new ClaudeCodeAdapter({ claudeBin: null }) })
    try {
      const res = await request(app).post(`${url}/runs`).send({})
      expect(res.status).toBe(412)
      expect(res.body.reason).toMatch(/claude CLI was not found/)
    } finally {
      await closeApp(app)
    }
  })
})
