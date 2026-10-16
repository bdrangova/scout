import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SCHEMA_VERSION } from '@review-dash/shared'
import type { Manifest } from '@review-dash/shared'
import { createCrissCrossRepo } from '@review-dash/shared/git/criss-cross-repo'
import type { CrissCrossRepo } from '@review-dash/shared/git/criss-cross-repo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Store } from './index.ts'

const ID = '20260101-0900-crisscross-abcd'

let home: string
let fixture: CrissCrossRepo
let store: Store

beforeAll(async () => {
  home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-virtual-')))
  fixture = await createCrissCrossRepo({ conflict: true })
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    id: ID,
    title: 'Criss-cross session',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    agent: { type: 'claude-code', sessionId: null, cliVersion: null, entrypoint: null },
    repo: { path: fixture.repo, remote: null, branch: 'H', baseRef: 'B' },
    tickets: [],
  }
  const dir = path.join(home, 'sessions', ID)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  store = new Store(home, { log: () => undefined })
})

afterAll(async () => {
  store.trees.close()
  await fixture.cleanup()
  await fs.rm(home, { recursive: true, force: true })
})

describe('Store with a virtual merge base', () => {
  it('diffs against the virtual tree, lists B..HEAD and keeps the overlay under <home>/cache/objects', async () => {
    const { tree, commits } = await store.tree(await store.loadSession(ID))
    expect(tree.baseVirtual).toBe(true)
    expect(tree.files.map((f) => f.path)).toEqual(['bin.dat', 'edit.txt', 'h1.txt', 'shared.txt'])
    expect(commits.baseSha).toBe(tree.baseSha)
    expect(commits.commits.map((c) => c.sha)).toEqual([fixture.merge, fixture.h1])
    const overlays = await fs.readdir(path.join(home, 'cache', 'objects'))
    expect(overlays).toHaveLength(1)
  })

  it('serves the before side of a file from the virtual tree', async () => {
    const before = await store.fileContents(ID, 'shared.txt', 'before')
    const text = before.body.toString('utf8')
    expect(text).toBe('shared by h0\nshared by M1\n')
    expect((await store.fileContents(ID, 'shared.txt', 'after')).body.toString('utf8')).toBe('shared resolved by H\n')
    await expect(store.fileContents(ID, 'h1.txt', 'before')).rejects.toMatchObject({ status: 404 })
  })
})
