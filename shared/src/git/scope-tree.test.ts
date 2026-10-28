import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLLAPSE_CHANGED_LINES, FINGERPRINT_RE } from '../constants.ts'
import { WorkingTreeSchema } from '../schemas/tree.ts'
import { gitText } from './run.ts'
import { computeScopeTree } from './scope-tree.ts'
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
const shas: Record<'root' | 'first' | 'rename' | 'side' | 'merge', string> = { root: '', first: '', rename: '', side: '', merge: '' }

async function run(args: string[]): Promise<string> {
  return gitText(repo, args, { env })
}

async function write(rel: string, content: string | Buffer): Promise<void> {
  await writeFile(path.join(repo, rel), content)
}

async function commit(message: string): Promise<string> {
  await run(['add', '-A'])
  await run(['commit', '-q', '-m', message])
  return (await run(['rev-parse', 'HEAD'])).trim()
}

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), 'scout-scope-'))
  await run(['init', '-q', '-b', 'main'])
  await write('a.txt', 'one\ntwo\nthree\n')
  await write('orig.txt', 'same content\nacross the rename\n')
  shas.root = await commit('root')

  await run(['checkout', '-q', '-b', 'feature'])
  await write('a.txt', 'one\n2\nthree\nfour\n')
  await write('bin.dat', Buffer.from([0, 1, 2, 3, 0, 255]))
  await write('package-lock.json', '{\n  "name": "x"\n}\n')
  await write('long.txt', Array.from({ length: COLLAPSE_CHANGED_LINES + 10 }, (_, i) => `line ${i}`).join('\n') + '\n')
  shas.first = await commit('first')

  await run(['mv', 'orig.txt', 'renamed.txt'])
  await write('a.txt', 'one\n2\nthree\nfour\nfive\n')
  shas.rename = await commit('rename and edit')

  await run(['checkout', '-q', '-b', 'side', 'main'])
  await write('side.txt', 's1\ns2\n')
  shas.side = await commit('side')
  await run(['checkout', '-q', 'feature'])
  await run(['merge', '-q', '--no-ff', '-m', 'merge side', 'side'])
  shas.merge = (await run(['rev-parse', 'HEAD'])).trim()

  await write('a.txt', 'one\n2\nthree\nfour\nfive\nsix\n')
  await write('untracked.txt', 'not added\n')
})

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('computeScopeTree for a commit', () => {
  it('diffs the commit against its first parent, reading sizes from blobs', async () => {
    const { tree, patches } = await computeScopeTree({ repo, scope: shas.rename })
    expect(WorkingTreeSchema.parse(tree)).toEqual(tree)
    expect(tree).toMatchObject({ baseRef: `${shas.rename}^1`, baseSha: shas.first, headSha: shas.rename, branch: null, dirty: false })
    expect(tree.files.map((f) => [f.path, f.status, f.oldPath, f.untracked])).toEqual([
      ['a.txt', 'modified', null, false],
      ['renamed.txt', 'renamed', 'orig.txt', false],
    ])
    expect(tree.files[0]).toMatchObject({ additions: 1, deletions: 0, sizeBefore: 17, sizeAfter: 22 })
    expect(tree.files[1]).toMatchObject({ additions: 0, deletions: 0, sizeBefore: 31, sizeAfter: 31 })
    expect(patches.get('renamed.txt')).toContain('rename from orig.txt')
    expect(patches.get('a.txt')).toContain('+five')
    expect(patches.get('a.txt')).not.toContain('+six')
    expect(tree.stats).toMatchObject({ files: 2, additions: 1, deletions: 0, modified: 1, renamed: 1 })
  })

  it('applies the collapse rules and fingerprints binaries from blob metadata', async () => {
    const { tree, patches } = await computeScopeTree({ repo, scope: shas.first })
    expect(tree.baseSha).toBe(shas.root)
    const byPath = new Map(tree.files.map((f) => [f.path, f]))
    expect(byPath.get('package-lock.json')).toMatchObject({ collapsed: true, collapseReason: 'generated-or-vendored', omitted: false })
    expect(byPath.get('long.txt')).toMatchObject({ collapsed: true, collapseReason: 'too-many-changed-lines', additions: COLLAPSE_CHANGED_LINES + 10 })
    expect(byPath.get('bin.dat')).toMatchObject({ binary: true, sizeBefore: null, sizeAfter: 6, collapsed: false })
    expect(patches.get('bin.dat')).toContain('Binary files /dev/null and b/bin.dat differ')
    expect(patches.has('package-lock.json')).toBe(true)
    for (const file of tree.files) expect(file.fingerprint).toMatch(FINGERPRINT_RE)
    expect(tree.stats).toMatchObject({ files: 4, collapsed: 2, binary: 1, added: 3, modified: 1 })

    const again = await computeScopeTree({ repo, scope: shas.first })
    expect(again.tree.fingerprint).toBe(tree.fingerprint)
    expect(again.tree.files.map((f) => f.fingerprint)).toEqual(tree.files.map((f) => f.fingerprint))
  })

  it('takes a merge commit against its first parent and a root commit against the empty tree', async () => {
    const merge = await computeScopeTree({ repo, scope: shas.merge })
    expect(merge.tree.baseSha).toBe(shas.rename)
    expect(merge.tree.files.map((f) => [f.path, f.status])).toEqual([['side.txt', 'added']])

    const root = await computeScopeTree({ repo, scope: shas.root })
    expect(root.tree.baseRef).toBe(`${shas.root}^1`)
    expect(root.tree.baseSha).toMatch(/^[0-9a-f]{40}$/)
    expect(root.tree.baseSha).not.toBe(shas.root)
    expect(root.tree.files.map((f) => [f.path, f.status, f.sizeBefore])).toEqual([
      ['a.txt', 'added', null],
      ['orig.txt', 'added', null],
    ])
    expect(root.patches.get('a.txt')).toContain('+++ b/a.txt')
  })

  it('rejects an unknown commit', async () => {
    await expect(computeScopeTree({ repo, scope: 'f'.repeat(40) })).rejects.toThrow(/rev-parse/)
  })
})

describe('computeScopeTree for uncommitted', () => {
  it('is the working tree against HEAD, untracked files included', async () => {
    const { tree, patches } = await computeScopeTree({ repo, scope: 'uncommitted' })
    expect(tree).toMatchObject({ baseRef: 'HEAD', baseSha: shas.merge, headSha: shas.merge, branch: 'feature', dirty: true })
    expect(tree.files.map((f) => [f.path, f.status, f.untracked])).toEqual([
      ['a.txt', 'modified', false],
      ['untracked.txt', 'added', true],
    ])
    expect(patches.get('a.txt')).toContain('+six')
    const full = await computeWorkingTree({ repo, baseRef: 'main' })
    expect(full.tree.files.length).toBeGreaterThan(tree.files.length)
  })
})
