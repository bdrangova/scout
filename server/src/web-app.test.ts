import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { closeApp, createApp } from './app.ts'
import { loadConfig } from './config.ts'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-webapp-'))
// A dot folder on the way, like `~/.ai-review/app/web`.
const webDir = path.join(home, '.ai-review', 'web')
fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true })
fs.writeFileSync(path.join(webDir, 'index.html'), '<div id="root"></div>')
fs.writeFileSync(path.join(webDir, 'assets', 'index-abc.js'), 'console.log(1)')
fs.writeFileSync(path.join(webDir, 'favicon.svg'), '<svg/>')

const app = createApp(
  loadConfig({ AI_REVIEW_HOME: home, AGENT_ADAPTER: 'fake', AI_REVIEW_WEB_DIR: webDir, PATH: '' }),
  { log: () => undefined },
)
afterAll(async () => {
  await closeApp(app)
  fs.rmSync(home, { recursive: true, force: true })
})

describe('built web app', () => {
  it('serves index.html for client-side routes', async () => {
    for (const url of ['/', '/s/abc/files', '/t']) {
      const res = await request(app).get(url).set('host', 'scout.localhost:4546')
      expect(res.status, url).toBe(200)
      expect(res.text).toBe('<div id="root"></div>')
    }
  })

  it('serves files and caches hashed assets for good', async () => {
    const asset = await request(app).get('/assets/index-abc.js').set('host', 'scout.localhost')
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toContain('immutable')
    expect((await request(app).get('/favicon.svg').set('host', 'scout.localhost')).status).toBe(200)
  })

  it('answers a missing asset with 404, not the page', async () => {
    expect((await request(app).get('/assets/gone.js').set('host', 'scout.localhost')).status).toBe(404)
  })

  it('keeps the API in charge of /api', async () => {
    const res = await request(app).get('/api/nope').set('host', 'scout.localhost')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'no route for GET /api/nope' })
    expect((await request(app).get('/api/health')).body.ok).toBe(true)
  })

  it('refuses other hosts', async () => {
    expect((await request(app).get('/').set('host', 'evil.example')).status).toBe(403)
  })
})
