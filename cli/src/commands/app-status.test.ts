import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from '@scout/shared/git/run'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appStatus, formatAppStatus, type AppStatusSystem } from './app-status.ts'
import { setRuntimeCommand } from './env.ts'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' }

let root: string
let home: string
let repo: string
let worktree: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'scout-app-')))
  home = path.join(root, 'home')
  repo = path.join(root, 'main')
  worktree = path.join(root, 'wt')
  await mkdir(home, { recursive: true })
  await mkdir(repo, { recursive: true })
  await gitText(repo, ['init', '-q', '-b', 'main'], { env: GIT_ENV })
  await gitText(repo, ['commit', '-q', '--allow-empty', '-m', 'base'], { env: GIT_ENV })
  await gitText(repo, ['worktree', 'add', '-q', '-b', 'wt', worktree], { env: GIT_ENV })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function fake(listeners: Record<number, { pid: number; cwd: string | null }[]>, answers: Record<string, number> = {}): AppStatusSystem {
  return {
    listeningPids: async (port) => (listeners[port] ?? []).map((l) => l.pid),
    command: async (pid) => `node server-${pid}`,
    cwd: async (pid) => Object.values(listeners).flat().find((l) => l.pid === pid)?.cwd ?? null,
    httpStatus: async (url) => answers[url] ?? null,
  }
}

describe('scout app-status', () => {
  it('classifies listeners as this checkout, another worktree or other, for ports given with --port', async () => {
    const system = fake(
      { 4001: [{ pid: 11, cwd: path.join(worktree, 'web') }], 4002: [{ pid: 12, cwd: path.join(repo, 'web') }], 4003: [{ pid: 13, cwd: '/somewhere/else' }], 4004: [] },
      { 'http://localhost:4001': 200 },
    )
    const status = await appStatus({ home, repo: worktree, ports: [4001, 4002, 4003, 4004], system })
    expect(status.source).toBe('flag')
    expect(status.ports.map((p) => p.listeners.map((l) => ({ thisCheckout: l.thisCheckout, otherWorktree: l.otherWorktree })))).toEqual([
      [{ thisCheckout: true, otherWorktree: null }],
      [{ thisCheckout: false, otherWorktree: repo }],
      [{ thisCheckout: false, otherWorktree: null }],
      [],
    ])
    expect(status.ports[0]).toMatchObject({ httpStatus: 200, url: 'http://localhost:4001' })
    expect(status.ports[1]?.httpStatus).toBeNull()
    expect(formatAppStatus(status).split('\n')).toHaveLength(5)
  })

  it('takes ports, url and start command from the runtime first', async () => {
    await setRuntimeCommand({ home, repo, command: `echo '{"apps":[{"name":"web","url":"http://localhost:8123"}],"start":"npm run dev"}'`, interactive: true })
    await mkdir(path.join(repo, '.claude'))
    await writeFile(path.join(repo, '.claude', 'launch.json'), JSON.stringify({ configurations: [{ name: 'x', port: 1 }] }))
    const status = await appStatus({ home, repo, system: fake({}) })
    expect(status).toMatchObject({ source: 'runtime', start: 'npm run dev', ports: [{ name: 'web', port: 8123, url: 'http://localhost:8123', listeners: [] }] })
  })

  it('falls back to .claude/launch.json and says so', async () => {
    await mkdir(path.join(repo, '.claude'))
    await writeFile(path.join(repo, '.claude', 'launch.json'), JSON.stringify({ configurations: [{ name: 'dash', runtimeExecutable: 'npm', runtimeArgs: ['run', 'dev'], port: 4556 }] }))
    const status = await appStatus({ home, repo, system: fake({ 4556: [{ pid: 5, cwd: repo }] }) })
    expect(status).toMatchObject({ source: 'launch.json', start: 'npm run dev', ports: [{ name: 'dash', port: 4556, listeners: [{ pid: 5, thisCheckout: true }] }] })
  })

  it('reports no ports when nothing names any', async () => {
    const status = await appStatus({ home, repo, system: fake({}) })
    expect(status).toMatchObject({ source: null, ports: [] })
    expect(formatAppStatus(status)).toMatch(/no ports known/)
  })
})
