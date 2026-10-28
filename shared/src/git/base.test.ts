import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WorkingTreeSchema } from '../schemas/tree.ts'
import { overlayDirFor, resolveBase } from './base.ts'
import { computeCommitList } from './commits.ts'
import { createCrissCrossRepo, type CrissCrossRepo } from './criss-cross-repo.ts'
import { showFile } from './repo.ts'
import { GitError, gitText } from './run.ts'
import { computeWorkingTree } from './working-tree.ts'

let fixture: CrissCrossRepo
let conflicting: CrissCrossRepo
let repo: string
let overlayRoot: string
let overlayDir: string

async function fileCount(dir: string): Promise<number> {
  let count = 0
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) if (entry.isFile()) count += 1
  return count
}

/** Everything a resolve could touch in the user's repo: loose/packed objects, the index, every ref. */
async function repoState(of: CrissCrossRepo = fixture): Promise<{ objects: number; index: string; refs: string }> {
  const index = await stat(path.join(of.repo, '.git', 'index'))
  return {
    objects: await fileCount(path.join(of.repo, '.git', 'objects')),
    index: `${index.mtimeMs}:${index.size}`,
    refs: await of.git(['for-each-ref']),
  }
}

beforeAll(async () => {
  ;[fixture, conflicting] = await Promise.all([createCrissCrossRepo(), createCrissCrossRepo({ conflict: true })])
  repo = fixture.repo
  overlayRoot = await mkdtemp(path.join(os.tmpdir(), 'scout-overlay-'))
  overlayDir = overlayDirFor(overlayRoot, repo)
})

afterAll(async () => {
  await Promise.all([fixture.cleanup(), conflicting.cleanup()])
  await rm(overlayRoot, { recursive: true, force: true })
})

describe('resolveBase', () => {
  it('the fixture really is a criss-cross: two merge bases, and neither alone gives the right diff', async () => {
    const all = (await fixture.git(['merge-base', '--all', 'B', 'HEAD'])).trim().split('\n').sort()
    expect(all).toEqual(fixture.bases)
    for (const base of fixture.bases) {
      const files = (await fixture.git(['diff', '--name-only', base])).trim().split('\n')
      expect(files).not.toEqual(['edit.txt', 'h1.txt'])
    }
  })

  it('returns a single merge base unchanged, without an env', async () => {
    const resolved = await resolveBase({ repo, baseRef: 'master', overlayDir })
    expect(resolved).toEqual({ sha: (await fixture.git(['rev-parse', 'master'])).trim(), virtual: false, env: null, reason: null })
  })

  it('folds several merge bases into a virtual tree in the overlay, writing nothing into the repo, and memoizes it', async () => {
    const before = await repoState()
    const first = await resolveBase({ repo, baseRef: 'B', overlayDir })
    expect(first.virtual).toBe(true)
    expect(first.reason).toBeNull()
    expect(first.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(first.env).toMatchObject({ GIT_OBJECT_DIRECTORY: overlayDir, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repo, '.git', 'objects') })
    expect(await repoState()).toEqual(before)
    // The virtual tree holds both sides' changes.
    const env = first.env ?? {}
    expect((await showFile(repo, first.sha, 'master.txt', { env })).toString()).toBe('master v1\n')
    expect((await showFile(repo, first.sha, 'h0.txt', { env })).toString()).toBe('h0\n')

    const second = await resolveBase({ repo, baseRef: 'B', overlayDir })
    expect(second).toEqual(first)
  })

  it('accepts a conflicting fold (merge-tree exit 1) without markers: text is the union of both sides, a binary keeps one side', async () => {
    const dir = overlayDirFor(overlayRoot, conflicting.repo)
    const before = await repoState(conflicting)
    const first = await resolveBase({ repo: conflicting.repo, baseRef: 'B', overlayDir: dir })
    expect(first.virtual).toBe(true)
    expect(await repoState(conflicting)).toEqual(before)
    const inRepo = (await conflicting.git(['ls-tree', '--name-only', first.sha]).catch((err: unknown) => err)) as unknown
    expect(inRepo).toBeInstanceOf(GitError)
    const env = first.env ?? {}
    const shared = (await showFile(conflicting.repo, first.sha, 'shared.txt', { env })).toString()
    expect(shared.split('\n').some((line) => /^(<<<<<<<|=======|>>>>>>>)/.test(line))).toBe(false)
    expect(shared).toBe('shared by h0\nshared by M1\n')
    // A valid, complete tree: every path of both bases is there, the binary with the first sorted base's blob.
    const entries = (await gitText(conflicting.repo, ['ls-tree', first.sha], { env })).trim().split('\n')
    expect(entries.map((e) => e.split('\t')[1]).sort()).toEqual(['b.txt', 'base.txt', 'bin.dat', 'edit.txt', 'h0.txt', 'master.txt', 'shared.txt'])
    const binBlob = entries.find((e) => e.endsWith('\tbin.dat'))?.split(/\s+/)[2]
    expect(binBlob).toBe((await conflicting.git(['rev-parse', `${conflicting.bases[0] ?? ''}:bin.dat`])).trim())

    const written = await fileCount(dir)
    expect(written).toBeGreaterThan(0)
    expect(await resolveBase({ repo: conflicting.repo, baseRef: 'B', overlayDir: dir })).toEqual(first)
    expect(await fileCount(dir)).toBe(written)
  })

  it('falls back to the first merge base with a reason when the overlay cannot be built', async () => {
    const blocked = path.join(overlayRoot, 'not-a-dir')
    await writeFile(blocked, '')
    const resolved = await resolveBase({ repo, baseRef: 'B', overlayDir: path.join(blocked, 'objects') })
    expect(resolved).toMatchObject({ sha: fixture.bases[0], virtual: false, env: null })
    expect(resolved.reason).toMatch(/virtual merge base not built/)
  })

  it('fails like git merge-base for an unknown ref', async () => {
    await expect(resolveBase({ repo, baseRef: 'no-such-ref', overlayDir })).rejects.toBeInstanceOf(GitError)
    await expect(computeWorkingTree({ repo, baseRef: 'no-such-ref', overlayDir })).rejects.toBeInstanceOf(GitError)
  })
})

describe('computeWorkingTree and computeCommitList with a virtual base', () => {
  it('shows only the branch’s own work: h1 and the uncommitted edit (not M1’s file, not b1’s, not h0’s)', async () => {
    const { tree, patches } = await computeWorkingTree({ repo, baseRef: 'B', overlayDir })
    expect(WorkingTreeSchema.parse(tree)).toEqual(tree)
    expect(tree.baseVirtual).toBe(true)
    expect(tree.baseSha).toBe((await resolveBase({ repo, baseRef: 'B', overlayDir })).sha)
    expect(tree.files.map((f) => [f.path, f.status])).toEqual([
      ['edit.txt', 'modified'],
      ['h1.txt', 'added'],
    ])
    expect(patches.get('edit.txt')).toContain('+edited locally')
  })

  it('reads before sides from the virtual tree when the fold had conflicts, and the patch has no marker lines', async () => {
    const dir = overlayDirFor(overlayRoot, conflicting.repo)
    const { tree, patches } = await computeWorkingTree({ repo: conflicting.repo, baseRef: 'B', overlayDir: dir })
    expect(tree.baseVirtual).toBe(true)
    expect(tree.files.map((f) => [f.path, f.status])).toEqual([
      ['bin.dat', 'modified'],
      ['edit.txt', 'modified'],
      ['h1.txt', 'added'],
      ['shared.txt', 'modified'],
    ])
    const sharedPatch = patches.get('shared.txt') ?? ''
    expect(sharedPatch.split('\n').some((line) => /^[-+](<<<<<<<|=======|>>>>>>>)/.test(line))).toBe(false)
    expect(sharedPatch).toContain('-shared by h0')
    expect(sharedPatch).toContain('-shared by M1')
    expect(sharedPatch).toContain('+shared resolved by H')
    const sharedBefore = tree.files.find((f) => f.path === 'shared.txt')?.sizeBefore ?? 0
    const { env } = await resolveBase({ repo: conflicting.repo, baseRef: 'B', overlayDir: dir })
    expect((await showFile(conflicting.repo, tree.baseSha, 'shared.txt', { env: env ?? {} })).length).toBe(sharedBefore)
  })

  it('lists B..HEAD: the merge commit and h1, not h0 which the base branch also has', async () => {
    const list = await computeCommitList({ repo, baseRef: 'B', overlayDir })
    const { tree } = await computeWorkingTree({ repo, baseRef: 'B', overlayDir })
    expect(list.baseSha).toBe(tree.baseSha)
    expect(list.commits.map((c) => [c.sha, c.merge, c.pushed])).toEqual([
      [fixture.merge, true, true],
      [fixture.h1, false, false],
    ])
    expect(list.remote).toEqual({ ref: 'origin/H', ahead: 1, behind: 0 })
    expect(list.uncommitted).toEqual({ files: 1, additions: 1, deletions: 0 })
  })

  it('keeps the single-merge-base behaviour: a commit sha, baseVirtual false', async () => {
    const { tree } = await computeWorkingTree({ repo, baseRef: 'master', overlayDir })
    expect(tree.baseVirtual).toBe(false)
    expect(tree.baseSha).toBe((await fixture.git(['rev-parse', 'master'])).trim())
    expect(tree.files.map((f) => f.path)).toEqual(['b.txt', 'edit.txt', 'h0.txt', 'h1.txt'])
  })
})
