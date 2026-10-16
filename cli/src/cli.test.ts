import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')

const COMMANDS = ['init', 'path', 'feedback', 'resolve', 'pending', 'status', 'open', 'install']

describe('ai-review bundle', () => {
  let home: string
  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), 'ai-review-cli-'))
  })
  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('lists every command in --help', async () => {
    const { stdout } = await execFileAsync(process.execPath, [bundle, '--help'])
    for (const name of COMMANDS) {
      expect(stdout).toMatch(new RegExp(`^\\s+${name}\\b`, 'm'))
    }
  })

  it('exits 1 with the error message for an unknown session', async () => {
    await expect(
      execFileAsync(process.execPath, [bundle, 'feedback', '20260101-0000-nope-0000'], { env: { ...process.env, AI_REVIEW_HOME: home } }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('manifest.json') })
  })

  it('reports no pending feedback for an empty store', async () => {
    const { stdout } = await execFileAsync(process.execPath, [bundle, 'pending', '--repo', home], { env: { ...process.env, AI_REVIEW_HOME: home } })
    expect(JSON.parse(stdout)).toMatchObject({ count: 0, sessions: [], message: '' })
  })
})
