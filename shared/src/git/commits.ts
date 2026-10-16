// NODE ONLY (see run.ts). The commits HEAD has and the base ref lacks (`<baseRef>..HEAD`: commits
// merged in from master are on the base side too and drop out), each with its own stats and
// whether the remote branch has it, plus the uncommitted stats. Everything is
// read-only: `--no-optional-locks` keeps `git diff` from refreshing the index.
import type { ChangeStats, Commit, CommitList, Remote } from '../schemas/commits.ts'
import { commitListFingerprint } from './fingerprint.ts'
import { parseNumstatZ } from './parse.ts'
import { resolveBase } from './base.ts'
import { currentBranch, headSha, refExists } from './repo.ts'
import { gitText, gitTry, type RunOptions } from './run.ts'
import { collectUntracked, DIFF_COMMON } from './working-tree.ts'

export interface ComputeCommitListOptions {
  /** Repository top level. */
  repo: string
  /** Ref name; the commit range is `<baseRef>..HEAD`, `baseSha` is what `resolveBase` returns for it. */
  baseRef: string
  /** Overlay object directory for virtual merge bases (see `base.ts`). */
  overlayDir?: string
  signal?: AbortSignal
}

const RECORD = '\x1e'
const FIELD = '\x1f'
/** One record per commit: sha, short sha, author, strict ISO date, parents, subject. */
const LOG_FORMAT = `--format=${RECORD}%H${FIELD}%h${FIELD}%an${FIELD}%aI${FIELD}%P${FIELD}%s`
const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t/

type CommitInfo = Omit<Commit, 'pushed'>

function emptyStats(): ChangeStats {
  return { files: 0, additions: 0, deletions: 0 }
}

/** Parses `git log --format=<LOG_FORMAT> --numstat` output (newest or oldest first as given). */
export function parseCommitLog(text: string): CommitInfo[] {
  const commits: CommitInfo[] = []
  for (const record of text.split(RECORD)) {
    if (record === '') continue
    const lines = record.split('\n')
    const [sha = '', shortSha = '', author = '', authoredAt = '', parentsText = '', ...subjectParts] = (lines[0] ?? '').split(FIELD)
    if (sha === '') throw new Error(`unexpected git log record: ${JSON.stringify(lines[0])}`)
    const stats = emptyStats()
    for (const line of lines.slice(1)) {
      const m = NUMSTAT_LINE.exec(line)
      if (!m) continue
      stats.files += 1
      if (m[1] !== '-') stats.additions += Number.parseInt(m[1] ?? '0', 10)
      if (m[2] !== '-') stats.deletions += Number.parseInt(m[2] ?? '0', 10)
    }
    const parents = parentsText.split(' ').filter((p) => p !== '')
    commits.push({ sha, shortSha, author, authoredAt, parents, merge: parents.length > 1, subject: subjectParts.join(FIELD), stats })
  }
  return commits
}

/** The branch's upstream, else `origin/<branch>` when that ref exists, else null (detached HEAD included). */
async function remoteRef(repo: string, branch: string | null, run: RunOptions): Promise<string | null> {
  const upstream = await gitTry(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], run)
  if (upstream !== null && upstream.trim() !== '') return upstream.trim()
  if (branch !== null && (await refExists(repo, `origin/${branch}`, run))) return `origin/${branch}`
  return null
}

/** Index and working tree against HEAD, untracked files included; null when clean. */
async function uncommittedStats(repo: string, run: RunOptions): Promise<ChangeStats | null> {
  const [numstatText, untracked] = await Promise.all([
    gitText(repo, ['--no-optional-locks', 'diff', ...DIFF_COMMON, '-M50%', '--numstat', '-z', 'HEAD'], run),
    collectUntracked(repo, run),
  ])
  const stats = emptyStats()
  for (const entry of parseNumstatZ(numstatText)) {
    stats.files += 1
    stats.additions += entry.additions
    stats.deletions += entry.deletions
  }
  for (const file of untracked) {
    stats.files += 1
    stats.additions += file.lines
  }
  return stats.files === 0 ? null : stats
}

async function remoteStatus(repo: string, baseRef: string, ref: string | null, commitCount: number, run: RunOptions): Promise<{ remote: Remote; remoteSha: string | null; unpushed: Set<string> }> {
  if (ref === null) return { remote: { ref: null, ahead: commitCount, behind: 0 }, remoteSha: null, unpushed: new Set() }
  const [unpushedText, countsText, remoteSha] = await Promise.all([
    gitText(repo, ['rev-list', `${baseRef}..HEAD`, `^${ref}`], run),
    gitText(repo, ['rev-list', '--left-right', '--count', `HEAD...${ref}`], run),
    gitText(repo, ['rev-parse', '--verify', `${ref}^{commit}`], run),
  ])
  const [aheadText = '0', behindText = '0'] = countsText.trim().split('\t')
  return {
    remote: { ref, ahead: Number.parseInt(aheadText, 10), behind: Number.parseInt(behindText, 10) },
    remoteSha: remoteSha.trim(),
    unpushed: new Set(unpushedText.split('\n').map((line) => line.trim()).filter((line) => line !== '')),
  }
}

export async function computeCommitList(options: ComputeCommitListOptions): Promise<CommitList> {
  const { repo, baseRef } = options
  const run: RunOptions = options.signal ? { signal: options.signal } : {}
  const [base, head, branch] = await Promise.all([
    resolveBase({ repo, baseRef, ...(options.overlayDir ? { overlayDir: options.overlayDir } : {}), ...run }),
    headSha(repo, run),
    currentBranch(repo, run),
  ])
  const [logText, ref, uncommitted] = await Promise.all([
    // One pass for every commit; a merge commit's stats are against its first parent.
    gitText(repo, ['log', '--reverse', '--no-color', '--ignore-submodules=all', '-M50%', '--diff-merges=first-parent', '--numstat', LOG_FORMAT, `${baseRef}..HEAD`], run),
    remoteRef(repo, branch, run),
    uncommittedStats(repo, run),
  ])
  const infos = parseCommitLog(logText)
  const { remote, remoteSha, unpushed } = await remoteStatus(repo, baseRef, ref, infos.length, run)
  const commits: Commit[] = infos.map((info) => ({ ...info, pushed: ref !== null && !unpushed.has(info.sha) }))
  return {
    baseRef,
    baseSha: base.sha,
    headSha: head,
    branch,
    remote,
    commits,
    uncommitted,
    fingerprint: commitListFingerprint({ headSha: head, remoteSha, commits, uncommitted }),
  }
}
