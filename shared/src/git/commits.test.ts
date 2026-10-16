import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FINGERPRINT_RE } from '../constants.ts'
import { CommitListSchema } from '../schemas/commits.ts'
import { computeCommitList, parseCommitLog } from './commits.ts'
import { git, gitText } from './run.ts'

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test Author',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let root: string
let repo: string
let tick = 0

/** Commits get increasing timestamps so `git log` order is deterministic. */
async function run(args: string[]): Promise<string> {
  tick += 1
  const date = `2026-01-01T10:${String(tick).padStart(2, '0')}:00+02:00`
  return gitText(repo, args, { env: { ...baseEnv, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
}

async function write(rel: string, content: string): Promise<void> {
  await writeFile(path.join(repo, rel), content)
}

async function sha(rev: string): Promise<string> {
  return (await run(['rev-parse', rev])).trim()
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'review-dash-commits-'))
  repo = path.join(root, 'repo')
  const remote = path.join(root, 'remote.git')
  await git(root, ['init', '-q', '--bare', remote], { env: baseEnv })
  await git(root, ['init', '-q', '-b', 'main', repo], { env: baseEnv })
  await write('a.txt', 'one\ntwo\nthree\n')
  await write('orig.txt', 'same content\nacross the rename\n')
  await run(['add', '-A'])
  await run(['commit', '-q', '-m', 'base'])
  await run(['remote', 'add', 'origin', remote])
  await run(['push', '-q', 'origin', 'main'])

  await run(['checkout', '-q', '-b', 'feature'])
  await write('a.txt', 'one\n2\nthree\nfour\n')
  await write('b.txt', 'b1\nb2\n')
  await run(['add', '-A'])
  await run(['commit', '-q', '-m', 'first: edit a, add b'])
  await run(['push', '-q', '-u', 'origin', 'feature'])

  await run(['mv', 'orig.txt', 'renamed.txt'])
  await run(['commit', '-q', '-m', 'second: rename only'])

  await run(['checkout', '-q', '-b', 'side', 'main'])
  await write('side.txt', 's1\ns2\ns3\n')
  await run(['add', 'side.txt'])
  await run(['commit', '-q', '-m', 'side: add side'])
  await run(['checkout', '-q', 'feature'])
  await run(['merge', '-q', '--no-ff', '-m', 'merge side', 'side'])
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('parseCommitLog', () => {
  it('reads sha, short sha, author, date, parents, subject and sums the numstat lines', () => {
    const text = `\x1e${'a'.repeat(40)}\x1faaaaaaa\x1fAda\x1f2026-01-01T10:00:00+02:00\x1f${'b'.repeat(40)} ${'c'.repeat(40)}\x1fMerge: x\x1fy\n\n3\t1\tsrc/a.ts\n-\t-\timg.png\n0\t0\told => new\n`
    expect(parseCommitLog(text)).toEqual([
      {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        author: 'Ada',
        authoredAt: '2026-01-01T10:00:00+02:00',
        parents: ['b'.repeat(40), 'c'.repeat(40)],
        merge: true,
        subject: 'Merge: x\x1fy',
        stats: { files: 3, additions: 3, deletions: 1 },
      },
    ])
    expect(parseCommitLog('')).toEqual([])
  })
})

describe('computeCommitList', () => {
  it('lists the commits oldest first with their own stats and marks the merge', async () => {
    const list = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(CommitListSchema.parse(list)).toEqual(list)
    expect(list.baseRef).toBe('origin/main')
    expect(list.baseSha).toBe(await sha('main'))
    expect(list.headSha).toBe(await sha('HEAD'))
    expect(list.branch).toBe('feature')
    expect(list.commits.map((c) => [c.subject, c.merge, c.stats])).toEqual([
      ['first: edit a, add b', false, { files: 2, additions: 4, deletions: 1 }],
      ['second: rename only', false, { files: 1, additions: 0, deletions: 0 }],
      ['side: add side', false, { files: 1, additions: 3, deletions: 0 }],
      ['merge side', true, { files: 1, additions: 3, deletions: 0 }],
    ])
    const merge = list.commits[3]
    expect(merge?.parents).toEqual([await sha('HEAD^1'), await sha('HEAD^2')])
    expect(merge?.sha).toBe(await sha('HEAD'))
    for (const commit of list.commits) {
      expect(commit.author).toBe('Test Author')
      expect(commit.shortSha).toBe(commit.sha.slice(0, commit.shortSha.length))
      expect(commit.authoredAt).toMatch(/^2026-01-01T10:\d\d:00\+02:00$/)
    }
    expect(list.uncommitted).toBeNull()
    expect(list.fingerprint).toMatch(FINGERPRINT_RE)
  })

  it('marks the commits the upstream has as pushed and counts ahead/behind', async () => {
    const list = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(list.remote).toEqual({ ref: 'origin/feature', ahead: 3, behind: 0 })
    expect(list.commits.map((c) => c.pushed)).toEqual([true, false, false, false])

    // A later push (simulated by moving the remote-tracking ref) marks everything pushed.
    await run(['update-ref', 'refs/remotes/origin/feature', 'HEAD'])
    const pushed = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(pushed.remote).toEqual({ ref: 'origin/feature', ahead: 0, behind: 0 })
    expect(pushed.commits.map((c) => c.pushed)).toEqual([true, true, true, true])
    expect(pushed.fingerprint).not.toBe(list.fingerprint)
    expect(pushed.commits.map((c) => c.sha)).toEqual(list.commits.map((c) => c.sha))

    // The remote moved on without us: behind counts its extra commit.
    await run(['update-ref', 'refs/remotes/origin/feature', 'side'])
    const behind = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(behind.remote).toEqual({ ref: 'origin/feature', ahead: 3, behind: 0 })
    expect(behind.commits.map((c) => c.pushed)).toEqual([false, false, true, false])
    await run(['update-ref', 'refs/remotes/origin/feature', 'HEAD^1'])
    expect((await computeCommitList({ repo, baseRef: 'origin/main' })).commits.map((c) => c.pushed)).toEqual([true, true, false, false])
  })

  it('falls back to origin/<branch> without an upstream and to nothing pushed without any remote ref', async () => {
    await run(['branch', '--unset-upstream'])
    const fallback = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(fallback.remote.ref).toBe('origin/feature')

    await run(['update-ref', '-d', 'refs/remotes/origin/feature'])
    const none = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(none.remote).toEqual({ ref: null, ahead: 4, behind: 0 })
    expect(none.commits.map((c) => c.pushed)).toEqual([false, false, false, false])
    expect(none.fingerprint).not.toBe(fallback.fingerprint)
  })

  it('reports no branch and no remote on a detached HEAD', async () => {
    await run(['checkout', '-q', '--detach'])
    const list = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(list.branch).toBeNull()
    expect(list.remote.ref).toBeNull()
    expect(list.commits).toHaveLength(4)
    await run(['checkout', '-q', 'feature'])
  })

  it('counts staged, unstaged and untracked changes as uncommitted and is stable otherwise', async () => {
    const clean = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(clean.uncommitted).toBeNull()
    expect((await computeCommitList({ repo, baseRef: 'origin/main' })).fingerprint).toBe(clean.fingerprint)

    await write('a.txt', 'one\n2\nthree\nfour\nfive\n')
    await write('b.txt', 'b1\n')
    await run(['add', 'b.txt'])
    await write('untracked.txt', 'u1\nu2')
    const dirty = await computeCommitList({ repo, baseRef: 'origin/main' })
    expect(dirty.uncommitted).toEqual({ files: 3, additions: 3, deletions: 1 })
    expect(dirty.fingerprint).not.toBe(clean.fingerprint)
    expect(dirty.commits).toEqual(clean.commits)
    expect(CommitListSchema.parse(dirty)).toEqual(dirty)
  })

  it('is empty when HEAD is the base', async () => {
    const list = await computeCommitList({ repo, baseRef: 'HEAD' })
    expect(list.commits).toEqual([])
    expect(list.baseSha).toBe(list.headSha)
    expect(list.remote).toEqual({ ref: null, ahead: 0, behind: 0 })
  })
})
