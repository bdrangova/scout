import fs from 'node:fs/promises'
import path from 'node:path'
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

const base = `/api/sessions/${FIXTURE_SESSION_ID}`

describe('GET /api/sessions/:id/evidence/*path', () => {
  it('serves media with its content type and honours Range requests', async () => {
    const png = await request(app).get(`${base}/evidence/shot.png`)
    expect(png.status).toBe(200)
    expect(png.headers['content-type']).toBe('image/png')
    expect(png.headers['accept-ranges']).toBe('bytes')

    const range = await request(app).get(`${base}/evidence/flow.webm`).set('Range', 'bytes=100-199')
    expect(range.status).toBe(206)
    expect(range.headers['content-type']).toBe('video/webm')
    expect(range.headers['content-range']).toBe('bytes 100-199/4096')
    expect(Number(range.headers['content-length'])).toBe(100)
  })

  it('refuses files the derived list does not contain, including traversal attempts', async () => {
    expect((await request(app).get(`${base}/evidence/notes.txt`)).status).toBe(404)
    expect((await request(app).get(`${base}/evidence/index.json`)).status).toBe(404)
    expect((await request(app).get(`${base}/evidence/gone.png`)).status).toBe(404)
    expect((await request(app).get(`${base}/evidence/..%2Fmanifest.json`)).status).toBe(404)
    expect((await request(app).get(`${base}/evidence/../manifest.json`)).status).toBe(404)
    expect((await request(app).get(`${base}/evidence/..%2F..%2F..%2Frepos%2Fx`)).status).toBe(404)
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000/evidence/shot.png')).status).toBe(404)
  })

  it('does not follow symlinks out of the session folder', async () => {
    const link = path.join(store.dir, 'evidence', 'escape.png')
    await fs.symlink(path.join(store.dir, 'manifest.json'), link)
    try {
      expect((await request(app).get(`${base}/evidence/escape.png`)).status).toBe(404)
      const detail = await request(app).get(`${base}`)
      expect((detail.body as { evidence: { path: string }[] }).evidence.map((e) => e.path)).not.toContain('escape.png')
    } finally {
      await fs.rm(link, { force: true })
    }
  })
})

describe('GET /api/sessions/:id/extras/*path and /spec/*path', () => {
  it('serves nested extras and spec files with the right content types', async () => {
    const md = await request(app).get(`${base}/extras/notes.md`)
    expect(md.status).toBe(200)
    expect(md.headers['content-type']).toBe('text/markdown; charset=utf-8')
    expect(md.text).toContain('# Fixture notes')

    const html = await request(app).get(`${base}/extras/report.html`)
    expect(html.status).toBe(200)
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8')

    const mmd = await request(app).get(`${base}/extras/diagrams/flow.mmd`)
    expect(mmd.status).toBe(200)
    expect(mmd.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(mmd.text).toContain('graph TD')

    const jira = await request(app).get(`${base}/spec/jira.md`)
    expect(jira.status).toBe(200)
    expect(jira.text).toContain('QI-1')
  })

  it('refuses index.json, unknown files and traversal', async () => {
    expect((await request(app).get(`${base}/extras/index.json`)).status).toBe(404)
    expect((await request(app).get(`${base}/spec/index.json`)).status).toBe(404)
    expect((await request(app).get(`${base}/spec/notes.md`)).status).toBe(404)
    expect((await request(app).get(`${base}/extras/..%2Fspec%2Fjira.md`)).status).toBe(404)
    expect((await request(app).get(`${base}/spec/..%2Fpr-description.md`)).status).toBe(404)
  })
})
