import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { HealthSchema } from '@scout/shared'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { closeApp, createApp } from '../app.ts'
import { loadConfig } from '../config.ts'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-health-'))
const app = createApp(
  loadConfig({ SCOUT_HOME: home, PATH: '' }),
  { log: () => undefined },
)
afterAll(async () => {
  await closeApp(app)
  fs.rmSync(home, { recursive: true, force: true })
})

describe('GET /api/health', () => {
  it('returns the Health shape built from the config', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(HealthSchema.parse(res.body)).toEqual({ ok: true, home })
  })

  it('answers unknown /api routes with an ApiError body', async () => {
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'no route for GET /api/nope' })
  })

  it('answers malformed JSON with an ApiError body', async () => {
    const res = await request(app).post('/api/health').set('content-type', 'application/json').send('{oops')
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })
})
