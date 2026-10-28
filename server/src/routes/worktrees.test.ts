import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CONFIG_FILE } from '@review-dash/shared'
import type { ApiError, Settings, WorktreeDetail, WorktreeListResponse } from '@review-dash/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { createFixtureRepo, GIT_TEST_ENV } from '../testing/fixture-repo.ts'
import type { FixtureRepo } from '../testing/fixture-repo.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { listen } from '../testing/sse-client.ts'
import { gitText } from '@review-dash/shared/git/run'

let store: FixtureStore
let repo: FixtureRepo
let folder: string
let app: Express
let server: Awaited<ReturnType<typeof listen>>

const wt = (name: string) => path.join(folder, name)
const git = (cwd: string, args: string[]) => gitText(cwd, args, { env: GIT_TEST_ENV })

beforeAll(async () => {
  store = await createFixtureStore()
  repo = await createFixtureRepo()
  folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-worktrees-')))
  await git(repo.repo, ['worktree', 'add', '-q', '-b', 'qi-15500-clean', wt('clean'), 'origin/master'])
  await fs.writeFile(wt('clean/extra.txt'), 'one\ntwo\n')
  await git(wt('clean'), ['add', '-A'])
  await git(wt('clean'), ['commit', '-q', '-m', 'work'])
  await git(repo.repo, ['worktree', 'add', '-q', '-b', 'dirty-branch', wt('dirty'), 'origin/master'])
  await fs.writeFile(wt('dirty/untracked.txt'), 'x\n')
  app = appFor(store.home)
  server = await listen(app)
})
afterAll(async () => {
  await closeApp(app)
  await server.close()
  await store.cleanup()
  await repo.cleanup()
  await fs.rm(folder, { recursive: true, force: true })
})

async function call<T>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(server.url + url, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: res.status, body: res.status === 204 ? (undefined as T) : ((await res.json()) as T) }
}

describe('settings', () => {
  it('reads defaults, then round-trips normalised folders (~ expanded, deduped, absolute)', async () => {
    expect((await call<Settings>('GET', '/api/settings')).body).toEqual({ worktreeFolders: [] })
    const put = await call<Settings>('PUT', '/api/settings', { worktreeFolders: ['~/wt/', path.join(os.homedir(), 'wt'), '/a/b/../c'] })
    expect(put.body).toEqual({ worktreeFolders: [path.join(os.homedir(), 'wt').split(path.sep).join('/'), '/a/c'] })
    expect((await call<Settings>('GET', '/api/settings')).body).toEqual(put.body)
    expect(JSON.parse(await fs.readFile(path.join(store.home, CONFIG_FILE), 'utf8'))).toEqual(put.body)
  })

  it('rejects an invalid body with 400', async () => {
    expect((await call<ApiError>('PUT', '/api/settings', { worktreeFolders: [''] })).status).toBe(400)
  })
})

describe('worktrees', () => {
  it('lists the linked worktrees of a folder, with branch, ticket, stats and uncommitted counts', async () => {
    await call('PUT', '/api/settings', { worktreeFolders: [folder, path.join(folder, 'missing')] })
    const { body } = await call<WorktreeListResponse>('GET', '/api/worktrees')
    expect(body.items.map((i) => i.name)).toEqual(['clean', 'dirty'])
    expect(body.errors).toEqual([{ folder: path.join(folder, 'missing'), error: 'folder does not exist' }])
    const [clean, dirty] = body.items
    expect(clean).toMatchObject({ path: wt('clean'), branch: 'qi-15500-clean', ticket: 'QI-15500', mainRepo: repo.repo, uncommitted: 0, ahead: 1, behind: 0, baseRef: 'origin/master' })
    expect(clean?.stats).toEqual({ files: 1, additions: 2, deletions: 0 })
    expect(clean?.id).toMatch(/^[0-9a-f]{12}$/)
    expect(dirty).toMatchObject({ branch: 'dirty-branch', ticket: null, uncommitted: 1, sessions: { 'code-review': 0, 'pr-review': 0, 'test-run': 0 } })
  })

  it('also lists through a main checkout folder, skipping the main one', async () => {
    await call('PUT', '/api/settings', { worktreeFolders: [repo.repo, folder] })
    const { body } = await call<WorktreeListResponse>('GET', '/api/worktrees')
    expect(body.items.map((i) => i.name)).toEqual(['clean', 'dirty'])
    await call('PUT', '/api/settings', { worktreeFolders: [folder] })
  })

  it('serves a detail and 404s an unknown id', async () => {
    const list = (await call<WorktreeListResponse>('GET', '/api/worktrees')).body
    const id = list.items[0]?.id ?? ''
    const detail = await call<WorktreeDetail>('GET', `/api/worktrees/${id}`)
    expect(detail.body.linkedSessions).toEqual([])
    expect((await call<ApiError>('GET', '/api/worktrees/000000000000')).status).toBe(404)
    expect((await call<ApiError>('DELETE', '/api/worktrees/000000000000')).status).toBe(404)
  })

  it('refuses to delete a dirty worktree and one with live sessions, then removes a clean one and keeps its branch', async () => {
    const list = (await call<WorktreeListResponse>('GET', '/api/worktrees')).body
    const idOf = (name: string) => list.items.find((i) => i.name === name)?.id ?? ''

    const dirty = await call<ApiError>('DELETE', `/api/worktrees/${idOf('dirty')}`)
    expect(dirty).toMatchObject({ status: 409, body: { reason: 'dirty' } })
    await expect(fs.access(wt('dirty'))).resolves.toBeUndefined()

    // A session whose repo is the clean worktree.
    const dir = fixtureSessionDir(store.home, FIXTURE_SESSION_ID)
    const manifestFile = path.join(dir, 'manifest.json')
    const original = await fs.readFile(manifestFile, 'utf8')
    const manifest = JSON.parse(original) as { repo: { path: string } }
    manifest.repo.path = wt('clean')
    await fs.writeFile(manifestFile, JSON.stringify(manifest))
    const linked = await call<WorktreeDetail>('GET', `/api/worktrees/${idOf('clean')}`)
    expect(linked.body.sessions['code-review']).toBe(1)
    expect(linked.body.linkedSessions.map((s) => s.id)).toEqual([FIXTURE_SESSION_ID])
    const blocked = await call<ApiError>('DELETE', `/api/worktrees/${idOf('clean')}`)
    expect(blocked).toMatchObject({ status: 409, body: { reason: 'sessions' } })

    await fs.writeFile(manifestFile, original)
    const removed = await call<undefined>('DELETE', `/api/worktrees/${idOf('clean')}`)
    expect(removed.status).toBe(204)
    await expect(fs.access(wt('clean'))).rejects.toThrow()
    expect(await git(repo.repo, ['branch', '--list', 'qi-15500-clean'])).toContain('qi-15500-clean')
    expect((await call<WorktreeListResponse>('GET', '/api/worktrees')).body.items.map((i) => i.name)).toEqual(['dirty'])
  })
})
