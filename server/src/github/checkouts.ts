import { gitTry } from '@scout/shared/git/run'
import { readSettings } from '../settings.ts'
import { discoverWorktrees, mainRepoOf } from '../worktrees/discover.ts'
import { repoOfRemote } from './pr-url.ts'

/**
 * Local paths whose `origin` is `repo` (`owner/name`, any case): the main checkouts of the configured worktree
 * folders first, then their worktrees; each path once.
 */
export async function checkoutsOf(home: string, repo: string): Promise<string[]> {
  const { worktreeFolders } = await readSettings(home)
  const { found } = await discoverWorktrees(worktreeFolders)
  const mains = await Promise.all(found.map((wt) => mainRepoOf(wt.path)))
  const ordered = [...new Set([...mains.filter((p): p is string => p !== null), ...found.map((wt) => wt.path)])]
  const wanted = repo.toLowerCase()
  const matches = await Promise.all(
    ordered.map(async (candidate) => {
      const remote = await gitTry(candidate, ['remote', 'get-url', 'origin'])
      return remote !== null && repoOfRemote(remote) === wanted ? candidate : null
    }),
  )
  return matches.filter((p): p is string => p !== null)
}
