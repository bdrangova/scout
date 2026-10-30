import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from '@scout/shared/git/run'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sessionDir } from '../store.ts'
import { addArtifact, removeArtifact } from './artifact.ts'
import { initSession } from './init.ts'
import { diffAgainstLog, publishLogDiff, publishLogWrite, type PublishLog } from './publish-log.ts'

const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.test' }
const git = (args: string[]) => gitText(repo, args, { env })
let home: string
let repo: string
let id: string

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'artifact-')))
  repo = path.join(home, 'repo')
  await mkdir(repo)
  await git(['init', '-qb', 'main'])
  await writeFile(path.join(repo, 'a.ts'), 'a1\n')
  await writeFile(path.join(repo, 'b.ts'), 'b1\n')
  await git(['add', '.'])
  await git(['commit', '-qm', 'base'])
  await git(['checkout', '-qb', 'feature'])
  id = (await initSession({ home, repo, base: 'main' })).id
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'))

describe('artifact add / remove', () => {
  it('copies the file, writes the index and replaces the entry for the same file', async () => {
    const shot = path.join(home, 'shot.png')
    await writeFile(shot, 'png')
    const first = await addArtifact({ home, id, kind: 'evidence', source: shot, fields: { caption: 'One', order: 1 } })
    const folder = path.join(sessionDir(home, id), 'evidence')
    expect(first.path).toBe(path.join(folder, 'shot.png'))
    await addArtifact({ home, id, kind: 'evidence', source: shot, as: 'other.png', fields: { caption: 'Two' } })
    await addArtifact({ home, id, kind: 'evidence', source: shot, fields: { caption: 'One again' } })
    expect(await readJson(path.join(folder, 'index.json'))).toEqual({
      items: [{ file: 'shot.png', caption: 'One again', order: 1 }, { file: 'other.png', caption: 'Two' }],
    })
  })

  it('keeps unknown index fields and skips the copy when the file is already in place', async () => {
    const folder = path.join(sessionDir(home, id), 'extras')
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'n.md'), '# n')
    await writeFile(path.join(folder, 'index.json'), JSON.stringify({ note: 'x', items: [{ file: 'z.md', title: 'Z', extra: 1 }] }))
    await addArtifact({ home, id, kind: 'extras', source: path.join(folder, 'n.md'), fields: { title: 'N' } })
    expect(await readJson(path.join(folder, 'index.json'))).toEqual({ note: 'x', items: [{ file: 'z.md', title: 'Z', extra: 1 }, { file: 'n.md', title: 'N' }] })
  })

  it('rejects options that do not belong to the kind and escaping names', async () => {
    const f = path.join(home, 'f.md')
    await writeFile(f, 'x')
    await expect(addArtifact({ home, id, kind: 'extras', source: f, fields: { caption: 'c' } })).rejects.toThrow(/not valid for extras/)
    await expect(addArtifact({ home, id, kind: 'evidence', source: f, as: '../x', fields: {} })).rejects.toThrow(/not a path inside/)
  })

  it('defaults spec sourcePath to the outside source and removes file plus entry', async () => {
    const f = path.join(home, 'PROJ-1.md')
    await writeFile(f, 'ticket')
    const { entry } = await addArtifact({ home, id, kind: 'spec', source: f, fields: { type: 'jira', title: 'T' } })
    expect(entry).toEqual({ file: 'PROJ-1.md', type: 'jira', title: 'T', sourcePath: f })
    const removed = await removeArtifact({ home, id, kind: 'spec', name: 'PROJ-1.md' })
    expect(removed.removedEntry).toBe(true)
    expect(await readJson(path.join(sessionDir(home, id), 'spec', 'index.json'))).toEqual({ items: [] })
    await expect(removeArtifact({ home, id, kind: 'spec', name: '../manifest.json' })).rejects.toThrow(/not a path inside/)
  })
})

describe('publish-log', () => {
  const log: PublishLog = {
    publishedAt: '2026-01-01T00:00:00.000Z',
    head: 'h',
    files: { 'a.ts': '1', 'b.ts': '2', 'c.ts': '3' },
    evidence: { 'e1.png': ['a.ts'], 'e2.png': ['c.ts'], 'e3.png': ['b.ts'] },
    extras: { 'x.md': ['a.ts', 'b.ts'], 'y.md': ['b.ts'] },
  }

  it('diffAgainstLog classifies files and the evidence/extras they touch', () => {
    const diff = diffAgainstLog(log, { 'a.ts': 'new', 'b.ts': '2', 'd.ts': '4' }, ['e3.png'])
    expect(diff).toMatchObject({ first: false, changed: ['a.ts'], added: ['d.ts'], dropped: ['c.ts'], evidenceToRecapture: ['e1.png'], evidenceToDelete: ['e2.png'], extrasToRegenerate: ['x.md'], refreshedEvidence: ['e3.png'] })
    expect(diffAgainstLog(null, { 'a.ts': '1' }, [])).toMatchObject({ first: true, added: ['a.ts'], changed: [] })
  })

  it('writes a log from the working tree, then diffs edits, untracked files and deletions', async () => {
    await writeFile(path.join(repo, 'a.ts'), 'a2\n')
    await writeFile(path.join(repo, 'new.ts'), 'n\n')
    expect((await publishLogDiff(home, id)).first).toBe(true)
    const coverage = path.join(home, 'cov.json')
    await writeFile(coverage, JSON.stringify({ evidence: { 's.png': ['a.ts'], 't.png': ['new.ts'] }, extras: { 'x.md': ['a.ts'] } }))
    const written = await publishLogWrite({ home, id, coveragePath: coverage })
    expect(Object.keys(written.files).sort()).toEqual(['a.ts', 'new.ts'])
    expect(written.head).toBe((await git(['rev-parse', 'HEAD'])).trim())
    expect((await publishLogDiff(home, id)).changed).toEqual([])

    await writeFile(path.join(repo, 'a.ts'), 'a3\n')
    await rm(path.join(repo, 'new.ts'))
    await writeFile(path.join(repo, 'b.ts'), 'b2\n')
    const diff = await publishLogDiff(home, id)
    expect(diff).toMatchObject({ changed: ['a.ts'], added: ['b.ts'], dropped: ['new.ts'], evidenceToRecapture: ['s.png'], evidenceToDelete: ['t.png'], extrasToRegenerate: ['x.md'] })

    await writeFile(coverage, JSON.stringify({ evidence: { 't.png': [] }, extras: { 'y.md': ['b.ts'] } }))
    const next = await publishLogWrite({ home, id, coveragePath: coverage })
    expect(next.evidence).toEqual({ 's.png': ['a.ts'] })
    expect(next.extras).toEqual({ 'x.md': ['a.ts'], 'y.md': ['b.ts'] })
  })
})
