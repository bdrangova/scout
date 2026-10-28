import fs from 'node:fs/promises'
import path from 'node:path'
import { agentCwd, manifestKind } from '@scout/shared'
import type { SessionListItem, SessionSummary, TestRunSummary, WorktreeDetail, WorktreeListResponse, WorktreeSummary } from '@scout/shared'
import { git } from '@scout/shared/git/run'
import { HttpError, conflict, errorMessage, notFound } from '../errors.ts'
import { readSettings } from '../settings.ts'
import type { Store } from '../store/index.ts'
import { discoverWorktrees } from './discover.ts'
import { summarizeWorktree } from './summary.ts'
import type { WorktreeBase } from './summary.ts'

/** Worktrees summarised at once; each runs several git processes. */
const CONCURRENCY = 4

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i] as T)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const posix = (p: string): string => p.split(path.sep).join('/')

async function realPosix(p: string): Promise<string> {
  try {
    return posix(await fs.realpath(p))
  } catch {
    return posix(p)
  }
}

function isListed(item: SessionListItem): item is SessionSummary | TestRunSummary {
  return !('error' in item)
}

/** Live sessions per (realpath'd) working directory, newest first. */
async function sessionsByCwd(store: Store): Promise<Map<string, { kind: ReturnType<typeof manifestKind>; item: SessionListItem | undefined }[]>> {
  const [items, ids] = await Promise.all([store.listSessions(), store.sessionIds()])
  const byId = new Map(items.map((item) => [item.id, item]))
  const result = new Map<string, { kind: ReturnType<typeof manifestKind>; item: SessionListItem | undefined }[]>()
  const entries = await Promise.all(
    ids.map(async (id) => {
      const manifest = await store.readManifest(id)
      return manifest.ok ? { cwd: await realPosix(agentCwd(manifest.manifest)), kind: manifestKind(manifest.manifest), item: byId.get(id) } : null
    }),
  )
  // `listSessions` is newest first; keep that order.
  const order = new Map(items.map((item, index) => [item.id, index]))
  entries
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => (order.get(a.item?.id ?? '') ?? 0) - (order.get(b.item?.id ?? '') ?? 0))
    .forEach(({ cwd, kind, item }) => result.set(cwd, [...(result.get(cwd) ?? []), { kind, item }]))
  return result
}

function withSessions(base: WorktreeBase, linked: { kind: ReturnType<typeof manifestKind>; item: SessionListItem | undefined }[]): WorktreeDetail {
  const sessions = { 'code-review': 0, 'pr-review': 0, 'test-run': 0 }
  for (const { kind } of linked) sessions[kind] += 1
  const linkedSessions = linked.flatMap(({ item }) => (item && isListed(item) ? [item] : []))
  const pr = linkedSessions.flatMap((item) => (item.kind === 'test-run' ? [] : item.pr ? [item.pr] : []))[0] ?? null
  return { ...base, pr, sessions, linkedSessions }
}

/** Re-discovers every worktree of the configured folders with its sessions; computed live, never stored. */
export async function loadWorktrees(home: string, store: Store): Promise<{ response: WorktreeListResponse; details: WorktreeDetail[] }> {
  const { worktreeFolders } = await readSettings(home)
  const [discovery, byCwd] = await Promise.all([discoverWorktrees(worktreeFolders), sessionsByCwd(store)])
  const overlayRoot = path.join(home, 'cache', 'objects')
  const settled = await mapLimited(discovery.found, CONCURRENCY, async (found) => {
    try {
      return { ok: true as const, base: await summarizeWorktree(found, overlayRoot) }
    } catch (err) {
      return { ok: false as const, folder: found.folder, error: `${found.path}: ${errorMessage(err)}` }
    }
  })
  const errors = [...discovery.errors]
  const details: WorktreeDetail[] = []
  for (const result of settled) {
    if (result.ok) details.push(withSessions(result.base, byCwd.get(result.base.path) ?? []))
    else errors.push({ folder: result.folder, error: result.error })
  }
  details.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
  const items: WorktreeSummary[] = details.map(({ linkedSessions: _linked, ...summary }) => summary)
  return { response: { folders: worktreeFolders, items, errors }, details }
}

export async function worktreeDetail(home: string, store: Store, id: string): Promise<WorktreeDetail> {
  const { details } = await loadWorktrees(home, store)
  const found = details.find((d) => d.id === id)
  if (!found) throw notFound(`no worktree ${id}`)
  return found
}

/** `git worktree remove` (never `--force`, the branch stays), refused while changes or live sessions would be lost. */
export async function deleteWorktree(home: string, store: Store, id: string): Promise<void> {
  const wt = await worktreeDetail(home, store, id)
  if (wt.uncommitted > 0) throw conflict(`${wt.name} has ${wt.uncommitted} uncommitted change${wt.uncommitted === 1 ? '' : 's'}`, 'dirty')
  const live = wt.sessions['code-review'] + wt.sessions['pr-review'] + wt.sessions['test-run']
  if (live > 0) throw conflict(`${wt.name} has ${live} live session${live === 1 ? '' : 's'}; archive them first`, 'sessions')
  if (wt.mainRepo === null) throw new HttpError(422, `cannot find the main checkout of ${wt.name}`)
  try {
    await git(wt.mainRepo, ['worktree', 'remove', wt.path])
  } catch (err) {
    throw conflict(errorMessage(err), 'git')
  }
}
