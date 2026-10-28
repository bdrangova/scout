// Finds the session a PR command works on.
import { currentBranch, topLevel } from '@scout/shared/git/repo'
import { openSessionForBranch } from '../sessions.ts'
import { manifestExists, sessionDir } from '../store.ts'
import { PrSyncError } from './gh.ts'

export interface PrSession {
  id: string
  dir: string
}

/** The given session id, or the open session of the current branch of `repo`. */
export async function findPrSession(options: { home: string; repo: string; id?: string | null }): Promise<PrSession> {
  if (options.id) {
    const dir = sessionDir(options.home, options.id)
    if (!(await manifestExists(dir))) throw new PrSyncError('no-session', `session ${options.id} not found under ${options.home} (no manifest.json)`)
    return { id: options.id, dir }
  }
  const repo = await topLevel(options.repo)
  const branch = await currentBranch(repo)
  const open = await openSessionForBranch(options.home, repo, branch)
  if (open === null) throw new PrSyncError('no-session', `no open review session for ${branch ?? 'detached HEAD'} in ${repo}: run ai-review init first, or pass the session id`)
  return { id: open.id, dir: open.dir }
}
