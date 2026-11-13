import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BlueprintGroupsSchema, type BlueprintGroups } from '@scout/shared'
import { gitText } from '@scout/shared/git/run'
import { makeManifest, makeTestRunManifest } from '@scout/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sessionDir, writeJsonAtomic } from '../store.ts'
import { formatGroupsContext, groupsContext, setGroups } from './groups.ts'
import { addJournalEntries } from './journal.ts'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com' }
const run = (cwd: string, args: string[]) => gitText(cwd, args, { env: GIT_ENV })

let home: string
let repo: string
let sessionId: string

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'scout-groups-'))
  repo = path.join(home, 'repo')
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await run(repo, ['init', '-q', '-b', 'master'])
  await writeFile(path.join(repo, 'src', 'a.ts'), 'one\ntwo\n')
  await run(repo, ['add', '-A'])
  await run(repo, ['commit', '-q', '-m', 'base'])
  await run(repo, ['checkout', '-q', '-b', 'feature/x'])
  await writeFile(path.join(repo, 'src', 'a.ts'), 'one\nchanged\nthree\n')
  await writeFile(path.join(repo, 'src', 'b.ts'), 'new file\n')
  const added = await addJournalEntries({ home, repo, inputs: [{ kind: 'summary', title: 'Adds the b module', file: 'src/b.ts' }] })
  sessionId = added.sessionId
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

async function input(value: unknown): Promise<string> {
  const file = path.join(home, `in-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(file, JSON.stringify(value))
  return file
}

const group = (id: string, files: string[], extra: object = {}) => ({ id, name: id, purpose: 'Does a thing.', files, ...extra })
const set = async (type: string, groups: unknown, id: string | null = null) => setGroups({ home, repo, id, type, from: await input({ groups }) })
const readGroups = async (): Promise<BlueprintGroups> =>
  BlueprintGroupsSchema.parse(JSON.parse(await readFile(path.join(sessionDir(home, sessionId), 'review', 'groups.json'), 'utf8')))

describe('groups context', () => {
  it('lists changed files with status, counts and journal summaries', async () => {
    const context = await groupsContext({ home, repo })
    expect(context.sessionId).toBe(sessionId)
    expect(context.files.map((f) => [f.path, f.status, f.summary])).toEqual([
      ['src/a.ts', 'modified', null],
      ['src/b.ts', 'added', 'Adds the b module'],
    ])
    expect(context.files[0]).toMatchObject({ additions: 2, deletions: 1 })
    const text = formatGroupsContext(context)
    expect(text).toContain('- src/a.ts | modified | +2 -1')
    expect(text).toContain('- src/b.ts | added | +1 -0 | Adds the b module')
    expect(text).toContain('(none)')
  })

  it('names existing groupings', async () => {
    await set('feature', [group('one', ['src/a.ts', 'src/b.ts'])])
    const context = await groupsContext({ home, repo, id: sessionId })
    expect(context.existing).toMatchObject([{ type: 'feature', groups: ['one'] }])
  })
})

describe('groups set', () => {
  it('writes the grouping and keeps the other groupings', async () => {
    await set('feature', [group('one', ['src/a.ts']), group('two', ['src/b.ts'])])
    const result = await set('layer', [group('base', ['src/a.ts'], { groups: [group('inner', ['src/b.ts'])] })])
    expect(result).toMatchObject({ type: 'layer', groups: 1, files: 2 })
    const file = await readGroups()
    expect(Object.keys(file.groupings).sort()).toEqual(['feature', 'layer'])
    await set('feature', [group('all', ['src/a.ts', 'src/b.ts'])])
    const again = await readGroups()
    expect(again.groupings.feature?.groups.map((g) => g.id)).toEqual(['all'])
    expect(again.groupings.layer).toBeDefined()
  })

  it('replaces an invalid existing file', async () => {
    await writeJsonAtomic(path.join(sessionDir(home, sessionId), 'review', 'groups.json'), { nope: true })
    await set('feature', [group('all', ['src/a.ts', 'src/b.ts'])])
    expect(Object.keys((await readGroups()).groupings)).toEqual(['feature'])
  })

  it('rejects an unknown file, a duplicate file and missing files, listing them', async () => {
    await expect(set('feature', [group('one', ['src/a.ts', 'src/b.ts', 'src/zzz.ts'])])).rejects.toThrow(/src\/zzz\.ts.*not a changed file/)
    await expect(set('feature', [group('one', ['src/a.ts', 'src/b.ts']), group('two', ['src/a.ts'])])).rejects.toThrow(/in both one and two/)
    await expect(set('feature', [group('one', ['src/a.ts'])])).rejects.toThrow(/in no group.*src\/b\.ts/)
  })

  it('rejects a bad priority top-level group, a bad type and a malformed file', async () => {
    await expect(set('priority', [group('everything', ['src/a.ts', 'src/b.ts'])])).rejects.toThrow(/must be one of/)
    await expect(set('shape', [group('one', ['src/a.ts', 'src/b.ts'])])).rejects.toThrow(/unknown grouping type/)
    await expect(set('feature', [{ id: 'Bad Id', name: 'x', purpose: '', files: [] }])).rejects.toThrow(/not a valid grouping/)
  })

  it('rejects a test run, and takes a PR review', async () => {
    const test = makeTestRunManifest({ id: '20260926-1000-a-aaaa' })
    await writeJsonAtomic(path.join(sessionDir(home, test.id), 'manifest.json'), test)
    await expect(set('feature', [group('one', ['src/a.ts'])], test.id)).rejects.toThrow(/is a test run/)
    await expect(groupsContext({ home, repo, id: test.id })).rejects.toThrow(/is a test run/)
    const base = makeManifest({ id: '20260926-1001-a-aaaa', kind: 'pr-review' })
    const pr = { ...base, repo: { ...base.repo, path: repo, baseRef: 'master' } }
    await writeJsonAtomic(path.join(sessionDir(home, pr.id), 'manifest.json'), pr)
    await expect(groupsContext({ home, repo, id: pr.id })).resolves.toMatchObject({ sessionId: pr.id })
  })
})
