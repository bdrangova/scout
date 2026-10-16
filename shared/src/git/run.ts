// NODE ONLY. `shared/src/git/**` spawns git and reads the filesystem; the web must never import it
// (import `@review-dash/shared/git/<file>` from the server and the CLI only; `index.ts` does not re-export it).
//
// Thin git runner. Every command runs with `core.quotepath=false` so paths come back unescaped;
// output is captured as a Buffer and decoded only where it is text.
import { execFile, type ExecFileException } from 'node:child_process'

const MAX_BUFFER = 1024 * 1024 * 1024

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed${exitCode === null ? '' : ` (exit ${exitCode})`}: ${stderr.trim()}`)
    this.name = 'GitError'
  }
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv
  input?: string
  /** Exit codes treated as success besides 0 (`git diff --no-index` exits 1 when files differ). */
  okExitCodes?: readonly number[]
  signal?: AbortSignal
}

export function git(repo: string, args: string[], options: RunOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['-c', 'core.quotepath=false', ...args],
      {
        cwd: repo,
        maxBuffer: MAX_BUFFER,
        encoding: 'buffer',
        env: options.env ?? process.env,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (error: ExecFileException | null, stdout: Buffer, stderr: Buffer) => {
        if (error) {
          const exitCode = typeof error.code === 'number' ? error.code : null
          if (exitCode !== null && options.okExitCodes?.includes(exitCode)) {
            resolve(stdout)
            return
          }
          const detail = stderr.length > 0 ? stderr.toString('utf8') : error.message
          reject(new GitError(args, exitCode, detail))
          return
        }
        resolve(stdout)
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
    else child.stdin?.end()
  })
}

export async function gitText(repo: string, args: string[], options: RunOptions = {}): Promise<string> {
  return (await git(repo, args, options)).toString('utf8')
}

/** Like `gitText` but returns null when git exits non-zero. */
export async function gitTry(repo: string, args: string[], options: RunOptions = {}): Promise<string | null> {
  try {
    return await gitText(repo, args, options)
  } catch (error) {
    if (error instanceof GitError && error.exitCode !== null) return null
    throw error
  }
}
