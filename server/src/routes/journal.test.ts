import fs from 'node:fs'
import path from 'node:path'
import { CodeReviewDetailSchema, JournalResponseSchema, SessionSummarySchema } from '@scout/shared'
import type { Journal } from '@scout/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

const url = `/api/sessions/${FIXTURE_SESSION_ID}/journal`
const at = '2026-01-01T10:00:00.000Z'
const journalFile = () => path.join(store.dir, 'review', 'journal.json')
const entry = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'decision', title: `Note ${id}`, body: 'Because.', file: 'src/app.ts', createdAt: at, updatedAt: at, ...extra })
const journal = (entries: unknown[], sessionId = FIXTURE_SESSION_ID) => ({ schemaVersion: 2, sessionId, updatedAt: at, nextId: entries.length + 1, entries })
const write = (value: unknown) => {
  fs.mkdirSync(path.dirname(journalFile()), { recursive: true })
  fs.writeFileSync(journalFile(), typeof value === 'string' ? value : JSON.stringify(value))
}

describe('GET /sessions/:id/journal', () => {
  it('answers { journal: null } without a file, and 404 for an unknown session', async () => {
    const res = await request(app).get(url)
    expect(res.status).toBe(200)
    expect(JournalResponseSchema.parse(res.body)).toEqual({ journal: null })
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000/journal')).status).toBe(404)
    const detail = CodeReviewDetailSchema.parse((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body)
    expect(detail.journalCount).toBe(0)
  })

  it('returns the raw journal and counts only live entries on the summary and detail', async () => {
    write(journal([entry('j1', { supersededBy: 'j2' }), entry('j2'), entry('j3', { kind: 'caveat', file: null })]))
    const body = JournalResponseSchema.parse((await request(app).get(url)).body)
    expect((body.journal as Journal).entries.map((e) => e.id)).toEqual(['j1', 'j2', 'j3'])
    const detail = CodeReviewDetailSchema.parse((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body)
    expect(detail.journalCount).toBe(2)
    const list = (await request(app).get('/api/sessions')).body as { id: string }[]
    expect(SessionSummarySchema.parse(list.find((s) => s.id === FIXTURE_SESSION_ID)).journalCount).toBe(2)
  })

  it('treats an invalid file or another session\'s journal as absent', async () => {
    write('{ not json')
    expect((await request(app).get(url)).body).toEqual({ journal: null })
    write(journal([entry('j1')], '20260101-0900-other-0000'))
    expect((await request(app).get(url)).body).toEqual({ journal: null })
    write({ schemaVersion: 2, entries: [] })
    expect((await request(app).get(url)).body).toEqual({ journal: null })
    expect(CodeReviewDetailSchema.parse((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body).journalCount).toBe(0)
  })
})
