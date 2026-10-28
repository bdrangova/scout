// NODE ONLY (see run.ts). Repository queries: refs, branches, blobs and the working tree.
import path from 'node:path'
import { git, gitText, gitTry, type RunOptions } from './run.ts'

export async function topLevel(cwd: string): Promise<string> {
  return (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
}

/**
 * The main worktree of the repository `cwd` is in, or `cwd`'s own top level when that cannot be told. It is the
 * parent of the shared `.git` directory; parsing `git worktree list` output is avoided because paths can hold
 * newlines or edge whitespace, and the result keys a stored command and a containment check.
 */
export async function mainWorktree(cwd: string): Promise<string> {
  const top = await topLevel(cwd)
  const out = await gitTry(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const commonDir = out?.replace(/\n$/, '')
  if (commonDir === undefined || commonDir === '' || path.basename(commonDir) !== '.git') return top
  const main = path.dirname(commonDir)
  if (main === top) return top
  // A linked worktree's own git dir must sit under the common dir's `worktrees/`, or this is not a worktree of `main`.
  const gitDir = (await gitTry(cwd, ['rev-parse', '--path-format=absolute', '--git-dir']))?.replace(/\n$/, '')
  return gitDir !== undefined && path.dirname(gitDir) === path.join(commonDir, 'worktrees') ? main : top
}

export async function headSha(repo: string, options: RunOptions = {}): Promise<string> {
  return (await gitText(repo, ['rev-parse', '--verify', 'HEAD^{commit}'], options)).trim()
}

/** Short branch name, or null when HEAD is detached. */
export async function currentBranch(repo: string, options: RunOptions = {}): Promise<string | null> {
  const out = await gitTry(repo, ['symbolic-ref', '-q', '--short', 'HEAD'], options)
  return out === null || out.trim() === '' ? null : out.trim()
}

export async function remoteUrl(repo: string, remote = 'origin'): Promise<string | null> {
  const out = await gitTry(repo, ['remote', 'get-url', remote])
  return out === null || out.trim() === '' ? null : out.trim()
}

export async function refExists(repo: string, ref: string, options: RunOptions = {}): Promise<boolean> {
  return (await gitTry(repo, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], options)) !== null
}

/**
 * The diff is always "everything changed against master": `origin/master`, then `master`, then
 * `origin/main`, then `main`, then whatever `origin/HEAD` points to, else `HEAD`. The remote ref
 * is preferred because a stale local master (121 commits behind in a measured checkout) turns a
 * 392-file diff into a 1,688-file one. `ai-review init --base <ref>` overrides the choice.
 */
export async function defaultBase(repo: string): Promise<string> {
  for (const candidate of ['origin/master', 'master', 'origin/main', 'main']) {
    if (await refExists(repo, candidate)) return candidate
  }
  const originHead = await gitTry(repo, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])
  if (originHead !== null && originHead.trim() !== '') return originHead.trim()
  return 'HEAD'
}

/** True when the index or working tree differs from HEAD, or untracked files exist. */
export async function isDirty(repo: string, options: RunOptions = {}): Promise<boolean> {
  return (await gitText(repo, ['status', '--porcelain'], options)).trim() !== ''
}

/** Files on disk that git does not track and `.gitignore` does not exclude. */
export async function untrackedFiles(repo: string, options: RunOptions = {}): Promise<string[]> {
  const out = await gitText(repo, ['ls-files', '--others', '--exclude-standard', '-z'], options)
  return out.split('\0').filter((p) => p !== '')
}

/** Raw content of `rev:path`. */
export async function showFile(repo: string, rev: string, filePath: string, options: RunOptions = {}): Promise<Buffer> {
  return git(repo, ['cat-file', 'blob', `${rev}:${filePath}`], options)
}

export interface BlobInfo {
  id: string
  size: number
}

/** Blob id and size of many `rev:path` objects in one process; null where the path does not resolve. */
export async function blobInfo(
  repo: string,
  rev: string,
  paths: readonly string[],
  options: RunOptions = {},
): Promise<Map<string, BlobInfo | null>> {
  const infos = new Map<string, BlobInfo | null>()
  if (paths.length === 0) return infos
  const input = paths.map((p) => `${rev}:${p}\n`).join('')
  const out = await gitText(repo, ['cat-file', '--batch-check=%(objectname) %(objectsize)'], { ...options, input })
  const lines = out.split('\n')
  paths.forEach((p, index) => {
    const line = lines[index] ?? ''
    const [id = '', sizeText = ''] = line.split(' ')
    const size = Number.parseInt(sizeText, 10)
    infos.set(p, line.endsWith(' missing') || id === '' || Number.isNaN(size) ? null : { id, size })
  })
  return infos
}

/** Blob ids git would give the files on disk, without writing them (`hash-object --stdin-paths`). */
export async function hashFiles(repo: string, paths: readonly string[], options: RunOptions = {}): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  if (paths.length === 0) return ids
  const out = await gitText(repo, ['hash-object', '--stdin-paths'], { ...options, input: paths.map((p) => `${p}\n`).join('') })
  const lines = out.split('\n')
  paths.forEach((p, index) => {
    const id = lines[index]?.trim()
    if (id) ids.set(p, id)
  })
  return ids
}
