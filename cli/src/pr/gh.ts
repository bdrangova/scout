// The GitHub CLI boundary: one injectable runner, and the error classes the commands map to exit codes.
import { execFile } from 'node:child_process'

/** Runs `gh <args>` in `cwd` and resolves with stdout; rejects with a `GhCommandError`. */
export type GhRunner = (args: readonly string[], cwd: string, options?: { input?: string }) => Promise<string>

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

export type PrErrorCode = 'gh-missing' | 'not-authenticated' | 'no-pr' | 'no-github-remote' | 'no-session' | 'gh-failed'

/** Process exit code per error code (0 = ok, 1 = anything else). */
const PR_EXIT_CODES: Record<PrErrorCode, number> = {
  'gh-failed': 1,
  'gh-missing': 2,
  'not-authenticated': 3,
  'no-pr': 4,
  'no-github-remote': 5,
  'no-session': 6,
}

export class PrSyncError extends Error {
  readonly code: PrErrorCode
  constructor(code: PrErrorCode, message: string) {
    super(message)
    this.name = 'PrSyncError'
    this.code = code
  }
  get exitCode(): number {
    return PR_EXIT_CODES[this.code]
  }
}

export const defaultGhRunner: GhRunner = (args, cwd, options) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'gh',
      [...args],
      { cwd, timeout: 120_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GH_PAGER: 'cat' } },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout)
          return
        }
        const missing = 'code' in error && error.code === 'ENOENT'
        reject(new GhCommandError(missing ? 'gh not found' : `gh ${args.join(' ')} failed: ${stderr.trim() || error.message}`, { stderr, missing }))
      },
    )
    // Text for gh (a comment body) goes through stdin, never into the argument list.
    if (options?.input !== undefined) {
      child.stdin?.on('error', () => undefined)
      child.stdin?.end(options.input)
    }
  })

/** Turns a failed `gh` call into the error the user sees. The remote check runs before the auth one: gh's no-remote hint mentions `gh auth login`. */
export function classifyGhError(error: unknown): PrSyncError {
  if (error instanceof PrSyncError) return error
  if (!(error instanceof GhCommandError)) return new PrSyncError('gh-failed', error instanceof Error ? error.message : String(error))
  if (error.missing) return new PrSyncError('gh-missing', 'the GitHub CLI (gh) is not installed or not on PATH: install it from https://cli.github.com and run `gh auth login`')
  const text = error.stderr
  if (/none of the git remotes|no git remotes|not a github|unable to determine (?:base )?repo|could not resolve to a repository|not a git repository/i.test(text)) {
    return new PrSyncError('no-github-remote', 'this repository has no GitHub remote that gh knows (check `git remote -v`; for GitHub Enterprise run `gh auth login --hostname <host>`)')
  }
  if (/no pull requests? found/i.test(text)) {
    return new PrSyncError('no-pr', 'no pull request found for the current branch: open one first, or pass --pr <number>')
  }
  if (/gh auth login|not logged in|authentication required|bad credentials|http 401|GH_TOKEN/i.test(text)) {
    return new PrSyncError('not-authenticated', 'gh is not authenticated: run `gh auth login` (or set GH_TOKEN), then retry')
  }
  return new PrSyncError('gh-failed', error.message)
}

/**
 * `gh api --paginate` prints one JSON array per page, back to back (`[...][...]`), unless `--slurp` is
 * available. Accepts both: splits the top-level JSON values by bracket depth (string-aware) and concatenates arrays.
 */
export function parsePagedArray(stdout: string): unknown[] {
  const text = stdout.trim()
  if (text === '') return []
  const values: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[' || ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === ']' || ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        values.push(JSON.parse(text.slice(start, i + 1)))
        start = -1
      }
    }
  }
  return values.flatMap((value) => (Array.isArray(value) ? (value as unknown[]) : [value]))
}
