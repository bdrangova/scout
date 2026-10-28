import path from 'node:path'
import type { WorktreeSummary } from '@review-dash/shared'
import { overlayDirFor } from '@review-dash/shared/git/base'
import { currentBranch, defaultBase } from '@review-dash/shared/git/repo'
import { gitText, gitTry } from '@review-dash/shared/git/run'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { mainRepoOf, worktreeId } from './discover.ts'
import type { FoundWorktree } from './discover.ts'

export type WorktreeBase = Omit<WorktreeSummary, 'pr' | 'sessions'>

const TICKET_RE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]*-\d+)/

/** `qi-15472-foo` becomes `QI-15472`; null when the branch has no key. */
export function ticketOf(branch: string | null): string | null {
  const match = branch === null ? null : TICKET_RE.exec(branch)
  return match?.[1] ? match[1].toUpperCase() : null
}

async function aheadBehind(repo: string, baseRef: string): Promise<{ ahead: number; behind: number } | null> {
  const out = await gitTry(repo, ['rev-list', '--left-right', '--count', `${baseRef}...HEAD`])
  const [behind, ahead] = (out ?? '').trim().split(/\s+/).map(Number)
  return behind === undefined || ahead === undefined || Number.isNaN(behind) || Number.isNaN(ahead) ? null : { ahead, behind }
}

/** Only read-only git: `--no-optional-locks` keeps `status` from refreshing the index, virtual bases go to the overlay. */
async function uncommittedCount(repo: string): Promise<number> {
  const out = await gitText(repo, ['--no-optional-locks', 'status', '--porcelain'])
  return out.split('\n').filter((line) => line !== '').length
}

/** Everything about a worktree that git knows; session fields are added by the caller. */
export async function summarizeWorktree(found: FoundWorktree, overlayRoot: string): Promise<WorktreeBase> {
  const wt = found.path
  const [branch, mainRepo, uncommitted, resolvedBase] = await Promise.all([currentBranch(wt), mainRepoOf(wt), uncommittedCount(wt), defaultBase(wt)])
  const baseRef = resolvedBase === 'HEAD' ? null : resolvedBase
  let counts: { ahead: number; behind: number } | null = null
  let stats = { files: 0, additions: 0, deletions: 0 }
  if (baseRef !== null) {
    counts = await aheadBehind(wt, baseRef)
    try {
      const { tree } = await computeWorkingTree({ repo: wt, baseRef, overlayDir: overlayDirFor(overlayRoot, wt) })
      stats = { files: tree.stats.files, additions: tree.stats.additions, deletions: tree.stats.deletions }
    } catch {
      // No merge base with the base ref (unrelated history): the stats stay zero, ahead/behind still show.
    }
  }
  return {
    id: worktreeId(wt),
    path: wt,
    name: path.posix.basename(wt),
    folder: found.folder,
    mainRepo,
    branch,
    ticket: ticketOf(branch),
    baseRef,
    ahead: counts?.ahead ?? null,
    behind: counts?.behind ?? null,
    stats,
    uncommitted,
  }
}
