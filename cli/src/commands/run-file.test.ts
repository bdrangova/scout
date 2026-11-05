import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from '@scout/shared/git/run'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManifest } from '../store.ts'
import { initTestRunSession } from './init-test-run.ts'
import { addBugFolder, addPlanFile, refreshRunFiles } from './run-file.ts'

const NOW = new Date('2026-10-22T09:00:00.000Z')
let home: string
let repo: string
let src: string
let id: string
let runPath: string

async function put(file: string, text = 'x'): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ai-review-runfile-')))
  repo = path.join(home, 'checkout')
  await mkdir(repo)
  await gitText(repo, ['init', '-q', '-b', 'main'])
  src = path.join(home, 'src')
  const run = await initTestRunSession({ home, repo, title: 'run', now: NOW })
  id = run.id
  runPath = run.runPath
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('run-file add', () => {
  it('copies the plan to run/plan/test-plan.md whatever its name and records the source', async () => {
    await put(path.join(src, 'my-plan.md'), '# plan\n')
    const result = await addPlanFile({ home, id, file: path.join(src, 'my-plan.md') })
    expect(result).toMatchObject({ item: 'plan', status: 'added', copy: path.join(runPath, 'plan', 'test-plan.md') })
    expect(await readFile(path.join(runPath, 'plan', 'test-plan.md'), 'utf8')).toBe('# plan\n')
    expect((await readManifest(path.dirname(runPath)))).toMatchObject({ run: { sources: { plan: path.join(src, 'my-plan.md') } } })
    expect((await addPlanFile({ home, id, file: path.join(src, 'my-plan.md') })).status).toBe('unchanged')
    await expect(addPlanFile({ home, id, file: path.join(src, 'nope.md') })).rejects.toThrow(/does not exist/)
  })

  it('copies a bug folder recursively, replaces an older copy, skips .DS_Store and records the source', async () => {
    const bug = path.join(src, 'login-broken')
    await put(path.join(bug, 'login-broken.md'), 'v1')
    await put(path.join(bug, 'screenshots', '1.png'), 'png')
    await put(path.join(bug, '.DS_Store'))
    expect((await addBugFolder({ home, id, folder: bug })).status).toBe('added')
    expect((await readdir(path.join(runPath, 'bugs', 'login-broken'))).sort()).toEqual(['login-broken.md', 'screenshots'])
    await rm(path.join(bug, 'screenshots'), { recursive: true })
    await put(path.join(bug, 'login-broken.md'), 'v2')
    expect((await addBugFolder({ home, id, folder: bug })).status).toBe('updated')
    expect(await readdir(path.join(runPath, 'bugs', 'login-broken'))).toEqual(['login-broken.md'])
    expect(await readFile(path.join(runPath, 'bugs', 'login-broken', 'login-broken.md'), 'utf8')).toBe('v2')
    expect(await readdir(path.join(runPath, 'bugs'))).toEqual(['login-broken'])
    expect((await readManifest(path.dirname(runPath)))).toMatchObject({ run: { sources: { bugs: { 'login-broken': bug } } } })
  })

  it('refuses a symlink that leaves the bug folder and copies nothing', async () => {
    const bug = path.join(src, 'leaky')
    await put(path.join(bug, 'leaky.md'))
    await put(path.join(src, 'secret.txt'), 'secret')
    await symlink(path.join(src, 'secret.txt'), path.join(bug, 'link.txt'))
    await expect(addBugFolder({ home, id, folder: bug })).rejects.toThrow(/points outside/)
    await expect(stat(path.join(runPath, 'bugs', 'leaky'))).rejects.toThrow()
    await rm(path.join(bug, 'link.txt'))
    await symlink(path.join(bug, 'leaky.md'), path.join(bug, 'inside.md'))
    await addBugFolder({ home, id, folder: bug })
    expect(await readFile(path.join(runPath, 'bugs', 'leaky', 'inside.md'), 'utf8')).toBe('x')
  })

  it('refuses a source inside the run folder and a code-review session', async () => {
    await put(path.join(runPath, 'bugs', 'b', 'b.md'))
    await expect(addBugFolder({ home, id, folder: path.join(runPath, 'bugs', 'b') })).rejects.toThrow(/inside the run folder/)
    await expect(addPlanFile({ home, id: '20260101-0900-nope-abcd', file: 'x.md' })).rejects.toThrow(/not a live session/)
  })
})

describe('run-file refresh', () => {
  it('copies every recorded source again and reports what changed and what is missing', async () => {
    await put(path.join(src, 'plan.md'), 'p1')
    await put(path.join(src, 'a', 'a.md'), 'a1')
    await put(path.join(src, 'b', 'b.md'), 'b1')
    await addPlanFile({ home, id, file: path.join(src, 'plan.md') })
    await addBugFolder({ home, id, folder: path.join(src, 'a') })
    await addBugFolder({ home, id, folder: path.join(src, 'b') })
    await put(path.join(src, 'plan.md'), 'p2')
    await rm(path.join(src, 'b'), { recursive: true })
    const results = await refreshRunFiles({ home, id })
    expect(results.map((r) => [r.item, r.status])).toEqual([['plan', 'updated'], ['bug:a', 'unchanged'], ['bug:b', 'missing']])
    expect(await readFile(path.join(runPath, 'plan', 'test-plan.md'), 'utf8')).toBe('p2')
    expect(await readFile(path.join(runPath, 'bugs', 'b', 'b.md'), 'utf8')).toBe('b1')
    expect((await readManifest(path.dirname(runPath)))).toMatchObject({ run: { sources: { bugs: { b: path.join(src, 'b') } } } })
  })

  it('has nothing to do for a run without recorded sources', async () => {
    expect(await refreshRunFiles({ home, id })).toEqual([])
  })
})
