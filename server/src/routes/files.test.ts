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

describe('GET /api/sessions/:id/patch', () => {
  it('concatenates the per-file patches in tree order, without the omitted file', async () => {
    const res = await request(app).get(`${base}/patch`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.text.startsWith('diff --git a/assets/logo.png b/assets/logo.png\n')).toBe(true)
    const order = ['a/assets/logo.png', 'a/package-lock.json', 'a/src/app.ts', 'b/src/new.ts', 'a/src/old.ts', 'rename to src/renamed.ts', 'b/src/untracked.ts']
    const positions = order.map((marker) => res.text.indexOf(marker))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(res.text).not.toContain('big.bin')
  })

  it('answers 404 for an unknown session', async () => {
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000/patch')).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/files/*path/patch', () => {
  it('serves the rename by its new path and the deletion by its old path', async () => {
    const renamed = await request(app).get(`${base}/files/src/renamed.ts/patch`)
    expect(renamed.status).toBe(200)
    expect(renamed.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(renamed.text.startsWith('diff --git a/src/original.ts b/src/renamed.ts\n')).toBe(true)
    expect(renamed.text).toContain('rename from src/original.ts')
    expect(renamed.text).not.toContain('a/src/old.ts')

    const deleted = await request(app).get(`${base}/files/src/old.ts/patch`)
    expect(deleted.status).toBe(200)
    expect(deleted.text).toContain('deleted file mode')
    expect(deleted.text).toContain('-export const old = true')

    const untracked = await request(app).get(`${base}/files/src/untracked.ts/patch`)
    expect(untracked.status).toBe(200)
    expect(untracked.text).toContain('--- /dev/null')
    expect(untracked.text).toContain('+++ b/src/untracked.ts')
  })

  it('answers 413 with isLarge for a collapsed file unless ?force=1', async () => {
    const refused = await request(app).get(`${base}/files/package-lock.json/patch`)
    expect(refused.status).toBe(413)
    expect(refused.body).toEqual({ error: expect.stringMatching(/generated-or-vendored.*force=1/), isLarge: true })
    const forced = await request(app).get(`${base}/files/package-lock.json/patch?force=1`)
    expect(forced.status).toBe(200)
    expect(forced.text).toContain('+++ b/package-lock.json')
  })

  it('answers 410 for an omitted file and 404 for unknown paths and traversal attempts', async () => {
    const omitted = await request(app).get(`${base}/files/big.bin/patch`)
    expect(omitted.status).toBe(410)
    expect(omitted.body.error).toMatch(/omitted.*too-large/)
    expect((await request(app).get(`${base}/files/src/keep.ts/patch`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/nope.ts/patch`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/..%2F..%2Fetc%2Fpasswd/patch`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/../../etc/passwd/patch`)).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/files/*path/contents', () => {
  it('serves before from the merge-base and after from disk, binary-safe', async () => {
    const before = await request(app).get(`${base}/files/src/app.ts/contents?side=before`)
    expect(before.status).toBe(200)
    expect(before.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(before.headers['x-content-type-options']).toBe('nosniff')
    expect(before.text).toContain("export const app = 'v1'")

    const after = await request(app).get(`${base}/files/src/app.ts/contents?side=after`)
    expect(after.status).toBe(200)
    expect(after.text).toContain("export const app = 'v2'")

    const renamedBefore = await request(app).get(`${base}/files/src/renamed.ts/contents?side=before`)
    expect(renamedBefore.status).toBe(200)
    expect(renamedBefore.text).toContain('export function original()')

    const logo = await request(app).get(`${base}/files/assets/logo.png/contents?side=after`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(logo.status).toBe(200)
    expect(logo.headers['content-type']).toBe('image/png')
    expect((logo.body as Buffer).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const bin = await request(app).get(`${base}/files/big.bin/contents?side=before`)
    expect(bin.status).toBe(404)
  })

  it('answers 404 for the missing side of added and deleted files, 400 without a side, 404 for unknown paths', async () => {
    expect((await request(app).get(`${base}/files/src/new.ts/contents?side=before`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/src/untracked.ts/contents?side=before`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/src/old.ts/contents?side=after`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/src/old.ts/contents?side=before`)).status).toBe(200)
    expect((await request(app).get(`${base}/files/src/app.ts/contents`)).status).toBe(400)
    expect((await request(app).get(`${base}/files/src/app.ts/contents?side=middle`)).status).toBe(400)
    expect((await request(app).get(`${base}/files/README.md/contents?side=after`)).status).toBe(404)
    expect((await request(app).get(`${base}/files/..%2Fmanifest.json/contents?side=after`)).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/search', () => {
  it('finds patch lines of the changed files, numbered on their side', async () => {
    const res = await request(app).get(`${base}/search?q=OLD = TRUE`)
    expect(res.status).toBe(200)
    expect(res.body.scope).toBe('diff')
    expect(res.body.files).toEqual([{ path: 'src/old.ts', truncated: false, hits: [{ side: 'old', line: 1, kind: 'del', text: 'export const old = true' }] }])
  })

  it('searches every file with scope=repo, and refuses a one-character query', async () => {
    const res = await request(app).get(`${base}/search?q=export&scope=repo`)
    expect(res.status).toBe(200)
    expect(res.body.scope).toBe('repo')
    expect(res.body.files.length).toBeGreaterThan(0)
    expect(res.body.files.every((f: { hits: { line: number }[] }) => f.hits.every((h) => h.line > 0))).toBe(true)
    expect((await request(app).get(`${base}/search?q=e`)).status).toBe(400)
  })
})

describe('GET /api/sessions/:id/repo-files/*path', () => {
  it('serves a repository file as text and refuses paths outside it', async () => {
    const ok = await request(app).get(`${base}/repo-files/src/app.ts`)
    expect(ok.status).toBe(200)
    expect(ok.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect((await request(app).get(`${base}/repo-files/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404)
    expect((await request(app).get(`${base}/repo-files/nope.ts`)).status).toBe(404)
  })
})
