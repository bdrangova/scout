// NODE ONLY (see run.ts). Test fixture: a temp repo whose base branch and HEAD have two merge
// bases (a criss-cross merge), the situation `base.ts` exists for. Used by shared and server tests.
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitText } from './run.ts'

const env: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

export interface CrissCrossRepo {
  /** Absolute, realpath'd repository top level; HEAD is branch `H`, the base branch is `B`. */
  repo: string
  /** Bare `origin`: `B` and `H` were pushed before `h1`, so `h1` is unpushed. */
  git(args: string[]): Promise<string>
  /** The two merge bases of `B` and `H` (sorted), `h1`, and `H`'s merge commit. */
  bases: string[]
  h1: string
  merge: string
  cleanup(): Promise<void>
}

export interface CrissCrossOptions {
  /**
   * `M1` and `h0` both change `shared.txt` and `bin.dat`, and `B` and `H` resolve the conflicts differently.
   * The virtual base then holds the union of both sides for `shared.txt` (no markers) and one side's blob for
   * `bin.dat`, `H`'s resolutions show as its own changes, and the virtual tree exists only in the overlay
   * (a clean fold equals `Hm`'s tree).
   */
  conflict?: boolean
}

/**
 *   M0 ── M1 (master.txt changed)
 *    \       \        \
 *     b1 ── h0 ── Bm (B: merges M1)
 *             \
 *              Hm (H: merges M1) ── h1 (h1.txt), then an uncommitted edit of edit.txt
 *
 * `B` was advanced to `h0` (as if H's first commit had been merged into the base branch), so `B`
 * and `H` have two merge bases, `h0` and `M1`. `git merge-base B H` picks one of them: `M1` makes
 * the diff show `b.txt` and `h0.txt`, `h0` makes it show master's change. The virtual base shows
 * neither: only `h1.txt` and the uncommitted edit.
 */
export async function createCrissCrossRepo(options: CrissCrossOptions = {}): Promise<CrissCrossRepo> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'scout-crisscross-')))
  const repo = path.join(root, 'repo')
  const remote = path.join(root, 'remote.git')
  let tick = 0
  const git = async (args: string[]): Promise<string> => {
    tick += 1
    const date = `2026-01-01T10:${String(tick).padStart(2, '0')}:00+02:00`
    return gitText(repo, args, { env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
  }
  const write = (rel: string, content: string | Buffer) => writeFile(path.join(repo, rel), content)
  const commit = async (message: string): Promise<string> => {
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', message])
    return (await git(['rev-parse', 'HEAD'])).trim()
  }

  await gitText(root, ['init', '-q', '--bare', remote], { env })
  await gitText(root, ['init', '-q', '-b', 'master', repo], { env })
  const conflict = options.conflict === true
  const mergeMaster = async (branch: string, message: string): Promise<void> => {
    await git(['checkout', '-q', branch])
    if (!conflict) {
      await git(['merge', '-q', '--no-ff', '-m', message, 'master'])
      return
    }
    await gitText(repo, ['merge', '-q', '--no-ff', '--no-commit', 'master'], { env, okExitCodes: [1] })
    await write('shared.txt', `shared resolved by ${branch}\n`)
    await write('bin.dat', Buffer.from([0, 1, 2, branch.charCodeAt(0)]))
    await commit(message)
  }

  await write('base.txt', 'base\n')
  await write('edit.txt', 'edit me\n')
  await write('master.txt', 'master v0\n')
  await write('shared.txt', 'shared v0\n')
  await write('bin.dat', Buffer.from([0, 1, 2, 3]))
  await commit('M0')
  await git(['checkout', '-q', '-b', 'B'])
  await write('b.txt', 'b1\n')
  await commit('b1')
  await git(['checkout', '-q', '-b', 'H'])
  await write('h0.txt', 'h0\n')
  if (conflict) {
    await write('shared.txt', 'shared by h0\n')
    await write('bin.dat', Buffer.from([0, 1, 2, 104]))
  }
  const h0 = await commit('h0')
  await git(['branch', '-f', 'B', 'H'])
  await git(['checkout', '-q', 'master'])
  await write('master.txt', 'master v1\n')
  if (conflict) {
    await write('shared.txt', 'shared by M1\n')
    await write('bin.dat', Buffer.from([0, 1, 2, 109]))
  }
  const m1 = await commit('M1')
  await mergeMaster('B', 'B merges M1')
  await mergeMaster('H', 'H merges M1')
  const merge = (await git(['rev-parse', 'HEAD'])).trim()
  await git(['remote', 'add', 'origin', remote])
  await git(['push', '-q', 'origin', 'B', 'H'])
  await write('h1.txt', 'h1\n')
  const h1 = await commit('h1')
  await write('edit.txt', 'edit me\nedited locally\n')

  return {
    repo,
    git,
    bases: [h0, m1].sort(),
    h1,
    merge,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}
