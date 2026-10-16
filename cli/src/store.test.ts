import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SESSION_ID_RE } from '@review-dash/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { newSessionId, resolveHome, sessionDir, slugify, writeJsonAtomic } from './store.ts'

describe('newSessionId', () => {
  const now = new Date(2026, 8, 26, 9, 5) // local time: 2026-09-26 09:05

  it('formats <yyyymmdd>-<hhmm>-<slug>-<4hex>', () => {
    const id = newSessionId('QI-15472: Trial bar', now, 'f1a0')
    expect(id).toBe('20260926-0905-qi-15472-trial-bar-f1a0')
    expect(id).toMatch(SESSION_ID_RE)
  })

  it('generates a random 4-hex suffix by default', () => {
    const id = newSessionId('Trial bar', now)
    expect(id).toMatch(/^20260926-0905-trial-bar-[0-9a-f]{4}$/)
    expect(id).toMatch(SESSION_ID_RE)
  })

  it('lower-cases, collapses non-alphanumeric runs and trims dashes', () => {
    expect(slugify('  Hello,  World!! (v2) ')).toBe('hello-world-v2')
    expect(slugify('___')).toBe('session')
    expect(slugify('Ünïcode → ascii')).toBe('n-code-ascii')
  })

  it('caps the slug at 40 characters without a trailing dash', () => {
    const slug = slugify('a'.repeat(39) + '-' + 'b'.repeat(20))
    expect(slug).toBe('a'.repeat(39))
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(newSessionId('x'.repeat(100), now, 'abcd')).toMatch(SESSION_ID_RE)
  })
})

describe('resolveHome / sessionDir', () => {
  it('uses AI_REVIEW_HOME when set, else ~/.ai-review', () => {
    expect(resolveHome({ AI_REVIEW_HOME: '/tmp/x' })).toBe(path.resolve('/tmp/x'))
    expect(resolveHome({})).toBe(path.join(os.homedir(), '.ai-review'))
    expect(sessionDir('/h', 'id')).toBe(path.join('/h', 'sessions', 'id'))
  })
})

describe('writeJsonAtomic', () => {
  let dir: string
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('writes the file and leaves no temp file behind', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ai-review-store-'))
    const file = path.join(dir, 'nested', 'manifest.json')
    await writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ a: 1 })
    expect(await readdir(path.join(dir, 'nested'))).toEqual(['manifest.json'])
  })
})
