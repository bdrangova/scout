import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
let outside: string
beforeAll(async () => {
  store = await createFixtureStore()
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-secret-'))
  await fs.writeFile(path.join(outside, 'secret.txt'), 'TOP SECRET\n')
  await fs.symlink(path.join(outside, 'secret.txt'), path.join(store.repo.repo, 'src', 'leak.txt'))
  await fs.symlink(outside, path.join(store.repo.repo, 'linked-dir'))
  app = appFor(store.home)
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
  await fs.rm(outside, { recursive: true, force: true })
})

const base = `/api/sessions/${FIXTURE_SESSION_ID}`

describe('GET /api/sessions/:id/files/*path/contents with symlinks', () => {
  it('answers the link target, not the file behind it', async () => {
    const res = await request(app).get(`${base}/files/src/leak.txt/contents?side=after`)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('TOP SECRET')
    expect(res.text).toBe(path.join(outside, 'secret.txt'))
  })

  it('does not read through a symlinked directory', async () => {
    const res = await request(app).get(`${base}/files/linked-dir/secret.txt/contents?side=after`)
    expect(res.status).toBe(404)
    expect(res.text).not.toContain('TOP SECRET')
  })

  it('sandboxes served files', async () => {
    const res = await request(app).get(`${base}/files/src/app.ts/contents?side=after`)
    expect(res.headers['content-security-policy']).toBe('sandbox')
  })
})
