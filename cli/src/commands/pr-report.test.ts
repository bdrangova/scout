import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach, it, expect } from 'vitest'
import { gitText } from '@review-dash/shared/git/run'
import { initSession } from './init.ts'
import { openSessionForBranch } from '../sessions.ts'
let home: string, repo: string
const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.test' }
beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'pr-init-'))); repo = path.join(home, 'repo'); await mkdir(repo)
  await gitText(repo, ['init', '-qb', 'main'], { env }); await writeFile(path.join(repo, 'file'), 'base')
  await gitText(repo, ['add', '.'], { env }); await gitText(repo, ['commit', '-qm', 'base'], { env })
})
afterEach(async () => { await rm(home, { recursive: true, force: true }) })
it('reuses PR review sessions independently of Development on the same checkout and branch', async () => {
  const dev = await initSession({ home, repo, base: 'main' })
  const pr = await initSession({ home, repo, base: 'main', kind: 'pr-review' })
  expect(pr.id).not.toBe(dev.id); expect(pr.manifest.kind).toBe('pr-review'); expect(pr.reused).toBe(false)
  expect((await initSession({ home, repo, kind: 'pr-review' })).id).toBe(pr.id)
  expect((await initSession({ home, repo })).id).toBe(dev.id)
  expect((await openSessionForBranch(home, repo, 'main'))?.id).toBe(dev.id)
  expect((await openSessionForBranch(home, repo, 'main', 'pr-review'))?.id).toBe(pr.id)
})
