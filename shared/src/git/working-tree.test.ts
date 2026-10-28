import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FINGERPRINT_RE } from '../constants.ts'
import { WorkingTreeSchema } from '../schemas/tree.ts'
import { defaultBase } from './repo.ts'
import { git } from './run.ts'
import { computeWorkingTree } from './working-tree.ts'

const env: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let repo: string

async function run(args: string[]): Promise<void> {
  await git(repo, args, { env })
}

async function write(rel: string, content: string | Buffer): Promise<void> {
  await writeFile(path.join(repo, rel), content)
}

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), 'scout-tree-'))
  await run(['init', '-q', '-b', 'main'])
  await write('.gitignore', 'ignored.txt\n')
  await write('a.txt', 'one\ntwo\nthree\n')
  await write('del.txt', 'bye\n')
  await write('orig.txt', 'same content\nacross the rename\n')
  await write('keep.txt', 'untouched\n')
  await run(['add', '-A'])
  await run(['commit', '-q', '-m', 'base'])
  await run(['checkout', '-q', '-b', 'feature'])
  await write('a.txt', 'one\n2\nthree\nfour\n')
  await rm(path.join(repo, 'del.txt'))
  await run(['mv', 'orig.txt', 'renamed.txt'])
  await write('tracked-new.txt', 'new tracked\n')
  await write('bin.dat', Buffer.from([0, 1, 2, 3, 0, 255]))
  await run(['add', 'tracked-new.txt', 'bin.dat'])
  await write('untracked.txt', 'not added\nyet')
  await write('ignored.txt', 'never shown\n')
})

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('defaultBase', () => {
  it('prefers origin/master, then master, then origin/main, then main', async () => {
    expect(await defaultBase(repo)).toBe('main')
    await run(['branch', 'master'])
    expect(await defaultBase(repo)).toBe('master')
    await run(['update-ref', 'refs/remotes/origin/master', 'master'])
    expect(await defaultBase(repo)).toBe('origin/master')
    await run(['update-ref', '-d', 'refs/remotes/origin/master'])
    await run(['branch', '-D', 'master'])
  })
})

describe('computeWorkingTree', () => {
  it('describes every kind of change against the merge-base', async () => {
    const { tree, patches } = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(WorkingTreeSchema.parse(tree)).toEqual(tree)
    expect(tree.branch).toBe('feature')
    expect(tree.dirty).toBe(true)
    expect(tree.baseRef).toBe('main')
    expect(tree.baseSha).toBe(tree.headSha)
    expect(tree.files.map((f) => [f.path, f.status, f.oldPath, f.binary, f.untracked])).toEqual([
      ['a.txt', 'modified', null, false, false],
      ['bin.dat', 'added', null, true, false],
      ['del.txt', 'deleted', null, false, false],
      ['renamed.txt', 'renamed', 'orig.txt', false, false],
      ['tracked-new.txt', 'added', null, false, false],
      ['untracked.txt', 'added', null, false, true],
    ])
    const byPath = new Map(tree.files.map((f) => [f.path, f]))
    expect(byPath.get('a.txt')).toMatchObject({ additions: 2, deletions: 1, sizeBefore: 14, sizeAfter: 17, collapsed: false, omitted: false })
    expect(byPath.get('del.txt')).toMatchObject({ additions: 0, deletions: 1, sizeBefore: 4, sizeAfter: null })
    expect(byPath.get('bin.dat')).toMatchObject({ additions: 0, deletions: 0, sizeBefore: null, sizeAfter: 6 })
    expect(byPath.get('untracked.txt')).toMatchObject({ additions: 2, deletions: 0, sizeBefore: null, sizeAfter: 13 })
    expect(byPath.get('renamed.txt')).toMatchObject({ additions: 0, deletions: 0, sizeBefore: 31, sizeAfter: 31 })
    expect(tree.stats).toEqual({ files: 6, additions: 5, deletions: 2, added: 3, modified: 1, deleted: 1, renamed: 1, binary: 1, collapsed: 0, omitted: 0 })
    for (const file of tree.files) expect(file.fingerprint).toMatch(FINGERPRINT_RE)
    expect(tree.fingerprint).toMatch(FINGERPRINT_RE)
    expect(tree.durationMs).toBeGreaterThanOrEqual(0)

    expect([...patches.keys()].sort()).toEqual(['a.txt', 'bin.dat', 'del.txt', 'renamed.txt', 'tracked-new.txt', 'untracked.txt'])
    expect(patches.get('a.txt')).toContain('+++ b/a.txt')
    expect(patches.get('untracked.txt')).toContain('--- /dev/null')
    expect(patches.get('untracked.txt')).toContain('+++ b/untracked.txt')
    expect(patches.get('bin.dat')).toContain('Binary files /dev/null and b/bin.dat differ')
    expect(patches.get('renamed.txt')).toContain('rename from orig.txt')
  })

  it('keeps fingerprints stable across recomputes and changes only the touched file', async () => {
    const first = await computeWorkingTree({ repo, baseRef: 'main' })
    const second = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(second.tree.files.map((f) => [f.path, f.fingerprint])).toEqual(first.tree.files.map((f) => [f.path, f.fingerprint]))
    expect(second.tree.fingerprint).toBe(first.tree.fingerprint)

    await write('a.txt', 'one\n2\nthree\nfour\nfive\n')
    const third = await computeWorkingTree({ repo, baseRef: 'main' })
    const before = new Map(first.tree.files.map((f) => [f.path, f.fingerprint]))
    for (const file of third.tree.files) {
      if (file.path === 'a.txt') expect(file.fingerprint).not.toBe(before.get('a.txt'))
      else expect(file.fingerprint).toBe(before.get(file.path))
    }
    expect(third.tree.fingerprint).not.toBe(first.tree.fingerprint)

    await write('bin.dat', Buffer.from([0, 9, 9, 9, 0, 255]))
    const fourth = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(fourth.tree.files.find((f) => f.path === 'bin.dat')?.fingerprint).not.toBe(before.get('bin.dat'))
  })

  it('drops an untracked file once it is deleted from disk and ignores .gitignore matches', async () => {
    await rm(path.join(repo, 'untracked.txt'))
    const { tree, patches } = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(tree.files.some((f) => f.path === 'untracked.txt')).toBe(false)
    expect(tree.files.some((f) => f.path === 'ignored.txt')).toBe(false)
    expect(patches.has('untracked.txt')).toBe(false)
    expect(tree.stats.files).toBe(5)
  })

  it('keeps the merge-base when the branch gains commits', async () => {
    const before = await computeWorkingTree({ repo, baseRef: 'main' })
    await run(['add', '-A'])
    await run(['commit', '-q', '-m', 'work'])
    const after = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(after.tree.baseSha).toBe(before.tree.baseSha)
    expect(after.tree.headSha).not.toBe(before.tree.headSha)
    expect(after.tree.dirty).toBe(false)
    expect(after.tree.files.map((f) => f.fingerprint)).toEqual(before.tree.files.map((f) => f.fingerprint))
  })
})
