import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EvidenceIndexSchema } from '@review-dash/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deriveArtifacts, listFilesRecursive, readIndex } from './artifacts.ts'

let dir: string
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-artifacts-'))
})
afterAll(() => fs.rm(dir, { recursive: true, force: true }))

describe('listFilesRecursive', () => {
  it('lists nested regular files as sorted posix paths, skipping dot-files, folders and symlinks; empty when missing', async () => {
    const root = path.join(dir, 'ev')
    await fs.mkdir(path.join(root, 'shots', 'deep'), { recursive: true })
    await fs.writeFile(path.join(root, 'b.png'), '')
    await fs.writeFile(path.join(root, 'shots', 'deep', 'a.png'), '')
    await fs.writeFile(path.join(root, 'shots', '.hidden.png'), '')
    await fs.mkdir(path.join(root, '.cache'))
    await fs.writeFile(path.join(root, '.cache', 'x.png'), '')
    await fs.symlink(path.join(dir, 'ev', 'b.png'), path.join(root, 'link.png'))
    expect(await listFilesRecursive(root)).toEqual(['b.png', 'shots/deep/a.png'])
    expect(await listFilesRecursive(path.join(dir, 'nope'))).toEqual([])
  })
})

describe('readIndex', () => {
  it('returns null when absent, logs and ignores invalid JSON or schema violations', async () => {
    const logs: string[] = []
    const log = (m: string) => void logs.push(m)
    const root = path.join(dir, 'idx')
    await fs.mkdir(root)
    expect(await readIndex(root, EvidenceIndexSchema, 'evidence/index.json', log)).toBeNull()
    await fs.writeFile(path.join(root, 'index.json'), '{ nope')
    expect(await readIndex(root, EvidenceIndexSchema, 'evidence/index.json', log)).toBeNull()
    await fs.writeFile(path.join(root, 'index.json'), JSON.stringify({ items: [{ caption: 'no file' }] }))
    expect(await readIndex(root, EvidenceIndexSchema, 'evidence/index.json', log)).toBeNull()
    await fs.writeFile(path.join(root, 'index.json'), JSON.stringify({ items: [{ file: 'a.png', order: 2 }] }))
    expect(await readIndex(root, EvidenceIndexSchema, 'evidence/index.json', log)).toEqual({ items: [{ file: 'a.png', order: 2 }] })
    expect(logs).toEqual([expect.stringMatching(/not valid JSON/), expect.stringMatching(/invalid.*items\.0\.file/)])
  })
})

describe('deriveArtifacts', () => {
  it('derives empty lists for a session without artifact folders', async () => {
    const root = path.join(dir, 'empty-session')
    await fs.mkdir(root)
    expect(await deriveArtifacts(root, () => undefined)).toEqual({ evidence: [], extras: [], spec: [] })
  })

  it('reads only the head of large documents for the title', async () => {
    const root = path.join(dir, 'big-session')
    await fs.mkdir(path.join(root, 'extras'), { recursive: true })
    await fs.writeFile(path.join(root, 'extras', 'huge.html'), `<title>Huge</title>${'x'.repeat(200_000)}`)
    await fs.writeFile(path.join(root, 'extras', 'late.md'), `${'text\n'.repeat(20_000)}# Too late`)
    const { extras } = await deriveArtifacts(root, () => undefined)
    expect(extras).toEqual([
      { path: 'huge.html', type: 'html', title: 'Huge' },
      { path: 'late.md', type: 'markdown', title: 'late.md' },
    ])
  })
})
