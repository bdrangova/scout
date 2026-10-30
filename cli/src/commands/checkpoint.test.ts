import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from '@scout/shared/git/run'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectSchemaPaths, formatLookup, lookupCheckpoint, utcStamp, writeManifest } from './checkpoint.ts'
import { sessionDir } from '../store.ts'
import { scratchDir } from './env.ts'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' }

let root: string
let home: string
let repo: string
let setup: string

async function commit(message: string) {
  await gitText(repo, ['add', '-A'], { env: GIT_ENV })
  await gitText(repo, ['commit', '-q', '-m', message], { env: GIT_ENV })
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ai-review-ckpt-')))
  home = path.join(root, 'home')
  repo = path.join(root, 'repo')
  setup = path.join(root, 'setup.md')
  await mkdir(path.join(repo, 'db', 'migrations'), { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(path.join(repo, 'db', 'migrations', '001.sql'), 'create table a (id int);')
  await writeFile(path.join(repo, 'README.md'), 'hi')
  await writeFile(setup, 'seed a company')
  await gitText(repo, ['init', '-q', '-b', 'main'], { env: GIT_ENV })
  await commit('base')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const manifestOptions = (folder: string) => ({ repo, folder, key: 'k', setupFile: setup, engine: 'mysql', database: 'app', host: 'localhost', dumpCommand: 'dump', restoreCommand: 'restore' })

describe('ai-review checkpoint', () => {
  it('detects schema and seed roots among tracked files', () => {
    expect(detectSchemaPaths(['a/db/x.sql', 'a/db/y.sql', 'src/migrations/1.ts', 'prisma/schema.prisma', 'schema.sql', 'src/app.ts'])).toEqual(['a/db', 'prisma', 'schema.sql', 'src/migrations'])
  })

  it('formats the UTC stamp', () => {
    expect(utcStamp(new Date('2026-10-30T09:08:07.123Z'))).toBe('20261030-090807')
  })

  it('reports missing, then found after a manifest is written, with the scratch folder by default', async () => {
    const now = new Date('2026-10-30T09:08:07Z')
    const first = await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup, now })
    expect(first).toMatchObject({ found: null, stale: [], schemaPaths: ['db'], schemaPathsSource: 'auto' })
    expect(first.saveTo).toBe(`${path.join(scratchDir(home, repo), 'snapshots', 'k', '20261030-090807')}/`)
    expect(formatLookup(first)).toBe('Checkpoint: none (missing)')

    const folder = first.saveTo.slice(0, -1)
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'db.sql'), 'dump')
    await writeManifest(manifestOptions(folder))
    const second = await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup })
    expect(second.found).toBe(folder)
    expect(formatLookup(second)).toBe(`Checkpoint: ${folder}`)
  })

  it('writes the manifest with files, hashes, counts and setup.md', async () => {
    const folder = path.join(root, 'out')
    await mkdir(folder)
    await writeFile(path.join(folder, 'db.sql'), 'dump')
    const counts = path.join(root, 'counts.json')
    await writeFile(counts, '{"users":3}')
    await writeManifest({ ...manifestOptions(folder), countsFile: counts })
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ key: 'k', engine: 'mysql', database: 'app', counts: { users: 3 }, schemaPaths: ['db'] })
    expect(manifest.head).toMatch(/^[0-9a-f]{40}$/)
    expect((manifest.files as { name: string; size: number; sha256: string }[]).map((f) => [f.name, f.size])).toEqual([['db.sql', 4], ['setup.md', 14]])
    expect(await readFile(path.join(folder, 'setup.md'), 'utf8')).toBe('seed a company')
  })

  it('marks a checkpoint stale when the setup or the migrations change, but not when only the head moves', async () => {
    const scratch = path.join(scratchDir(home, repo), 'snapshots', 'k', '20260101-000000')
    await mkdir(scratch, { recursive: true })
    await writeManifest(manifestOptions(scratch))

    await writeFile(path.join(repo, 'README.md'), 'changed')
    await commit('readme only')
    expect((await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup })).found).toBe(scratch)

    await writeFile(setup, 'different setup')
    const bySetup = await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup })
    expect(bySetup.found).toBeNull()
    expect(formatLookup(bySetup)).toBe('Checkpoint: none (stale: setup description changed)')

    await writeFile(setup, 'seed a company')
    await writeFile(path.join(repo, 'db', 'migrations', '002.sql'), 'alter table a;')
    await commit('migration')
    const bySchema = await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup })
    expect(bySchema.stale).toEqual([{ folder: scratch, reason: 'migration/seed files changed' }])
    // An explicit --schema that excludes the migrations ignores the change.
    expect((await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup, schema: ['README.md'] })).found).toBeNull()
  })

  it('keeps checkpoints in the session folder with --session', async () => {
    const result = await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup, session: 's1' })
    expect(result.saveTo.startsWith(`${path.join(sessionDir(home, 's1'), 'snapshots', 'k')}/`)).toBe(true)
  })

  it('picks the newest matching checkpoint and rejects bad keys', async () => {
    const base = path.join(scratchDir(home, repo), 'snapshots', 'k')
    for (const stamp of ['20260101-000000', '20260102-000000']) {
      await mkdir(path.join(base, stamp), { recursive: true })
      await writeManifest(manifestOptions(path.join(base, stamp)))
    }
    expect((await lookupCheckpoint({ home, repo, key: 'k', setupFile: setup })).found).toBe(path.join(base, '20260102-000000'))
    await expect(lookupCheckpoint({ home, repo, key: '../x', setupFile: setup })).rejects.toThrow(/invalid setup key/)
  })
})
