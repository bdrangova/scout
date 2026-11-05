import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from '@scout/shared/git/run'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readConfig } from '../config.ts'
import { checkoutEnv, scratchDir, setRuntimeCommand } from './env.ts'
import { addPack, removePack } from './pack.ts'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' }

let home: string
let repo: string
let worktree: string

beforeEach(async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ai-review-env-')))
  home = path.join(root, 'home')
  repo = path.join(root, 'main')
  worktree = path.join(root, 'worktrees', 'slot2-fix')
  await mkdir(home, { recursive: true })
  await mkdir(repo, { recursive: true })
  await gitText(repo, ['init', '-q', '-b', 'main'], { env: GIT_ENV })
  await gitText(repo, ['commit', '-q', '--allow-empty', '-m', 'base'], { env: GIT_ENV })
  await gitText(repo, ['worktree', 'add', '-q', '-b', 'slot2-fix', worktree], { env: GIT_ENV })
  // A runtime script the way a repository would ship one: it reads a per-checkout file, Scout never does.
  await writeFile(path.join(repo, 'port.txt'), '8080\n')
  await writeFile(path.join(worktree, 'port.txt'), '8123\n')
})
afterEach(async () => {
  await rm(path.dirname(home), { recursive: true, force: true })
})

const RUNTIME = `p=$(cat port.txt); printf '{"label":"%s","apps":[{"name":"web","url":"http://localhost:%s","port":%s}],"databases":[{"engine":"mysql","port":3306,"compose":{"project":"%s_database"}}],"extra":1}' "$(basename "$AI_REVIEW_CHECKOUT")" "$p" "$p" "$(basename "$PWD")"`

describe('ai-review env', () => {
  it('tells a linked worktree from the main worktree and puts scratch outside both', async () => {
    const main = await checkoutEnv({ home, repo })
    const linked = await checkoutEnv({ home, repo: path.join(worktree) })
    expect(main).toMatchObject({ checkout: repo, mainCheckout: repo, linkedWorktree: false, branch: 'main', runtime: null, runtimeCommand: null })
    expect(linked).toMatchObject({ checkout: worktree, mainCheckout: repo, linkedWorktree: true, branch: 'slot2-fix' })
    expect(linked.scratch).toBe(scratchDir(home, worktree))
    expect(linked.scratch.startsWith(path.join(home, 'checkouts'))).toBe(true)
    expect(linked.scratch).not.toBe(main.scratch)
  })

  it('runs the repository runtime command in each checkout; one entry covers every worktree', async () => {
    await setRuntimeCommand({ home, repo: worktree, command: RUNTIME, interactive: true })
    const linked = await checkoutEnv({ home, repo: worktree })
    expect(linked.runtimeError).toBeNull()
    expect(linked.runtime).toMatchObject({ label: 'slot2-fix', apps: [{ url: 'http://localhost:8123', port: 8123 }], databases: [{ compose: { project: 'slot2-fix_database' } }], extra: 1 })
    expect((await checkoutEnv({ home, repo })).runtime?.apps?.[0]?.port).toBe(8080)
  })

  it('reports a failing or malformed runtime command instead of throwing', async () => {
    await setRuntimeCommand({ home, repo, command: 'echo nope', interactive: true })
    expect(await checkoutEnv({ home, repo: worktree })).toMatchObject({ runtime: null, runtimeError: 'the runtime command did not print JSON' })
    await setRuntimeCommand({ home, repo, command: `echo '{"apps":[{"url":1}]}'`, interactive: true })
    expect((await checkoutEnv({ home, repo })).runtimeError).toMatch(/unexpected shape: apps\.0\.name/)
    await setRuntimeCommand({ home, repo, command: 'echo broken >&2; exit 3', interactive: true })
    expect((await checkoutEnv({ home, repo })).runtimeError).toMatch(/broken/)
  })

  it('keeps the rest of config.json, clears the entry, and refuses an agent', async () => {
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ port: 4999, trustedPrCommentAuthors: ['a'], future: true }))
    await setRuntimeCommand({ home, repo: worktree, command: 'true', interactive: true })
    const stored = JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8')) as Record<string, unknown>
    expect(stored).toEqual({ port: 4999, trustedPrCommentAuthors: ['a'], future: true, repos: { [repo]: { runtime: 'true' } } })
    expect((await readConfig(home)).port).toBe(4999)
    await setRuntimeCommand({ home, repo, command: null, interactive: true })
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8'))).toMatchObject({ repos: {} })
    await expect(setRuntimeCommand({ home, repo, command: 'true', interactive: false })).rejects.toThrow(/terminal, not by an agent/)
  })

  it('reads the runtime command from a file the dashboard Settings wrote (no port)', async () => {
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ worktreeFolders: ['/w'], repos: { [repo]: { runtime: 'echo {}' } } }))
    expect(await readConfig(home)).toMatchObject({ port: 4546, repos: { [repo]: { runtime: 'echo {}' } } })
    expect((await checkoutEnv({ home, repo: worktree })).runtimeCommand).toBe('echo {}')
  })

  it('takes the runtime and the skills from a pack that names the origin; a stored command wins', async () => {
    const pack = path.join(path.dirname(home), 'pack')
    await mkdir(pack, { recursive: true })
    await writeFile(path.join(pack, 'runtime.sh'), RUNTIME)
    await writeFile(
      path.join(pack, 'scout-pack.json'),
      JSON.stringify({ name: 'acme', repos: ['acme-app'], runtime: 'sh "$SCOUT_PACK_DIR/runtime.sh"', skills: { worktree: 'acme-worktree', testData: 'acme-data' } }),
    )
    await expect(addPack({ home, dir: pack, interactive: false })).rejects.toThrow(/terminal, not by an agent/)
    expect((await addPack({ home, dir: pack, interactive: true })).added).toBe(true)
    expect((await addPack({ home, dir: pack, interactive: true })).added).toBe(false)

    // No origin, or another one: the pack does not apply.
    expect(await checkoutEnv({ home, repo: worktree })).toMatchObject({ runtime: null, runtimeSource: null, packs: [], skills: {} })
    await gitText(repo, ['remote', 'add', 'origin', 'git@github.com:Org/acme-app.git'])
    const linked = await checkoutEnv({ home, repo: worktree })
    expect(linked).toMatchObject({ runtimeSource: 'pack:acme', packs: [{ name: 'acme', dir: pack }], skills: { worktree: 'acme-worktree', testData: 'acme-data' } })
    expect(linked.runtime?.apps?.[0]?.port).toBe(8123)

    await setRuntimeCommand({ home, repo, command: `echo '{"label":"stored"}'`, interactive: true })
    expect(await checkoutEnv({ home, repo })).toMatchObject({ runtimeSource: 'repo', runtime: { label: 'stored' } })

    expect(await removePack({ home, dir: pack, interactive: true })).toBe(true)
    expect((await checkoutEnv({ home, repo })).packs).toEqual([])
  })

  it('refuses to register a folder without a valid pack manifest', async () => {
    const dir = path.join(path.dirname(home), 'not-a-pack')
    await mkdir(dir, { recursive: true })
    await expect(addPack({ home, dir, interactive: true })).rejects.toThrow(/no scout-pack.json/)
    await writeFile(path.join(dir, 'scout-pack.json'), JSON.stringify({ name: 'x', repos: [], files: '../outside' }))
    await expect(addPack({ home, dir, interactive: true })).rejects.toThrow(/repos/)
    await writeFile(path.join(dir, 'scout-pack.json'), JSON.stringify({ name: 'x', repos: ['r'], files: '../outside' }))
    await expect(addPack({ home, dir, interactive: true })).rejects.toThrow(/inside the pack/)
  })
})
