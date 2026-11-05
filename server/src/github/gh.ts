// The GitHub CLI boundary of the server: one injectable runner (same pattern as the CLI's, which the server does not import).
import { execFile } from 'node:child_process'

/** Runs `gh <args>` in `cwd` and resolves with stdout; rejects with a `GhCommandError`. */
export type GhRunner = (args: readonly string[], cwd: string) => Promise<string>

export class GhCommandError extends Error {
  readonly stderr: string
  /** `gh` could not be started at all (not installed or not on PATH). */
  readonly missing: boolean
  constructor(message: string, options: { stderr: string; missing: boolean }) {
    super(message)
    this.name = 'GhCommandError'
    this.stderr = options.stderr
    this.missing = options.missing
  }
}

export const defaultGhRunner: GhRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'gh',
      [...args],
      { cwd, timeout: 60_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GH_PAGER: 'cat' } },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout)
          return
        }
        const missing = 'code' in error && error.code === 'ENOENT'
        reject(new GhCommandError(missing ? 'gh not found' : `gh ${args.join(' ')} failed: ${stderr.trim() || error.message}`, { stderr, missing }))
      },
    )
  })

export type GhFailure = 'gh-missing' | 'not-authenticated' | 'gh-failed'

/** What a failed `gh` call means for the dashboard. */
export function classifyGhFailure(error: unknown): GhFailure {
  if (!(error instanceof GhCommandError)) return 'gh-failed'
  if (error.missing) return 'gh-missing'
  if (/gh auth login|not logged in|authentication required|bad credentials|http 401|GH_TOKEN/i.test(error.stderr)) return 'not-authenticated'
  return 'gh-failed'
}
