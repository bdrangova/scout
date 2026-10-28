import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { OMIT_MAX_BYTES } from '@scout/shared'
import { gitText } from '@scout/shared/git/run'

/** A hermetic git environment: no user or system config, fixed identity. */
export const GIT_TEST_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

export interface FixtureRepo {
  /** Absolute, realpath'd repository top level. */
  repo: string
  git(args: string[]): Promise<string>
  write(rel: string, content: string | Buffer): Promise<void>
  cleanup(): Promise<void>
}

/** Minimal PNG-looking bytes (a real signature so `looksBinary` and git both treat it as binary). */
export function pngBytes(seed: number): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13, seed & 0xff, 0, 0, 0, 1, 0, 0, 0, 1])])
}

/**
 * A temp repo with a base commit on `master` pushed to a local bare `origin` (so `defaultBase`
 * picks `origin/master`) and branch work on `feature/fixture`: a modified file, a tracked added
 * file, an untracked file, a deletion, a rename, a modified binary, a collapsed lockfile, an
 * omitted (too large) untracked file and an ignored file.
 */
export async function createFixtureRepo(parentDir: string = os.tmpdir()): Promise<FixtureRepo> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(parentDir, 'scout-repo-')))
  const repo = path.join(root, 'repo')
  const remote = path.join(root, 'remote.git')
  await fs.mkdir(repo)
  const git = async (args: string[]): Promise<string> => gitText(repo, args, { env: GIT_TEST_ENV })
  const write = async (rel: string, content: string | Buffer): Promise<void> => {
    const file = path.join(repo, ...rel.split('/'))
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
  }

  await git(['init', '-q', '-b', 'master'])
  await write('.gitignore', 'ignored.txt\n')
  await write('README.md', '# Fixture repo\n')
  await write('src/app.ts', "export const app = 'v1'\nexport function run(): void {\n  console.log(app)\n}\n")
  await write('src/old.ts', 'export const old = true\n')
  await write('src/original.ts', 'export function original(): number {\n  return 1\n}\n// stable content so the rename is detected\n')
  await write('src/keep.ts', 'export const keep = 1\n')
  await write('assets/logo.png', pngBytes(1))
  await write('package-lock.json', '{\n  "name": "fixture",\n  "lockfileVersion": 3,\n  "packages": {}\n}\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'base'])
  await gitText(root, ['init', '-q', '--bare', remote], { env: GIT_TEST_ENV })
  await git(['remote', 'add', 'origin', remote])
  await git(['push', '-q', 'origin', 'master'])

  await git(['checkout', '-q', '-b', 'feature/fixture'])
  await write('src/app.ts', "export const app = 'v2'\nexport function run(): void {\n  console.log(app, 'again')\n}\n")
  await git(['rm', '-q', 'src/old.ts'])
  await git(['mv', 'src/original.ts', 'src/renamed.ts'])
  await write('src/new.ts', 'export const fresh = true\n')
  await git(['add', 'src/new.ts'])
  await git(['commit', '-q', '-m', 'feature work'])
  // Uncommitted work on top of the branch commit.
  await write('assets/logo.png', pngBytes(2))
  await write('package-lock.json', '{\n  "name": "fixture",\n  "lockfileVersion": 3,\n  "packages": {\n    "node_modules/x": { "version": "1.0.0" }\n  }\n}\n')
  await write('src/untracked.ts', 'export const untracked = 1\n')
  await write('big.bin', Buffer.alloc(OMIT_MAX_BYTES + 1, 0x61))
  await write('ignored.txt', 'never shown\n')

  return {
    repo,
    git,
    write,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  }
}
