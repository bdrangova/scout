// `scout publish-log diff|write`: what changed in the session's files since the last publish, so a refresh redoes only what it must.
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import { isTestRun, SESSION_EVIDENCE_DIR } from '@scout/shared'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { gitText } from '@scout/shared/git/run'
import { readManifest, resolveHome, sessionDir, writeJsonAtomic } from '../store.ts'

const PUBLISH_LOG_FILE = 'publish-log.json'
const coverage = z.record(z.string(), z.array(z.string()))

export const PublishLogSchema = z.object({
  publishedAt: z.iso.datetime({ offset: true }),
  head: z.string(),
  /** Repo path -> `git hash-object` of the file when it was published. */
  files: z.record(z.string(), z.string()),
  /** Evidence file -> repo paths it shows. */
  evidence: coverage,
  /** Extras file -> repo paths it covers. */
  extras: coverage,
})
export type PublishLog = z.infer<typeof PublishLogSchema>

const CoverageInputSchema = z.object({ evidence: coverage.optional(), extras: coverage.optional() })

export interface PublishDiff {
  first: boolean
  publishedAt: string | null
  changed: string[]
  added: string[]
  dropped: string[]
  evidenceToRecapture: string[]
  evidenceToDelete: string[]
  extrasToRegenerate: string[]
  refreshedEvidence: string[]
}

/** Pure part of `diff`: compares the current hashes with the log. */
export function diffAgainstLog(log: PublishLog | null, current: Record<string, string>, refreshedEvidence: string[]): PublishDiff {
  const previous = log?.files ?? {}
  const paths = Object.keys(current).sort()
  const changed = paths.filter((p) => p in previous && previous[p] !== current[p])
  const added = paths.filter((p) => !(p in previous))
  const dropped = Object.keys(previous).filter((p) => !(p in current)).sort()
  const touched = new Set([...changed, ...added, ...dropped])
  const droppedSet = new Set(dropped)
  const intersects = (covered: string[]) => covered.some((p) => touched.has(p))
  const evidence = Object.entries(log?.evidence ?? {})
  const evidenceToDelete = evidence.filter(([, covered]) => covered.length > 0 && covered.every((p) => droppedSet.has(p))).map(([file]) => file)
  return {
    first: log === null,
    publishedAt: log?.publishedAt ?? null,
    changed,
    added,
    dropped,
    evidenceToRecapture: evidence.filter(([file, covered]) => intersects(covered) && !evidenceToDelete.includes(file)).map(([file]) => file),
    evidenceToDelete,
    extrasToRegenerate: Object.entries(log?.extras ?? {}).filter(([, covered]) => intersects(covered)).map(([file]) => file),
    refreshedEvidence,
  }
}

/** Applies a coverage input over the previous coverage; an empty list removes the entry. */
export function mergeCoverage(previous: Record<string, string[]>, update: Record<string, string[]> | undefined): Record<string, string[]> {
  const merged = { ...previous, ...update }
  for (const [file, covered] of Object.entries(merged)) if (covered.length === 0) delete merged[file]
  return merged
}

async function load(home: string, id: string): Promise<{ dir: string; repo: string; baseRef: string }> {
  const dir = sessionDir(home, id)
  const manifest = await readManifest(dir)
  if (isTestRun(manifest)) throw new Error(`session ${id} is a test run: it has no changed files to publish`)
  return { dir, repo: manifest.repo.path, baseRef: manifest.repo.baseRef }
}

/** Repo path -> blob hash for every changed (not deleted) file of the session, untracked files included. */
async function currentHashes(repo: string, baseRef: string): Promise<Record<string, string>> {
  const { tree } = await computeWorkingTree({ repo, baseRef })
  const paths = tree.files.filter((f) => f.status !== 'deleted').map((f) => f.path)
  const hashes: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 200) {
    const chunk = paths.slice(i, i + 200)
    const lines = (await gitText(repo, ['hash-object', '--', ...chunk])).split('\n').filter((l) => l !== '')
    chunk.forEach((p, n) => {
      hashes[p] = lines[n] ?? ''
    })
  }
  return hashes
}

async function readLog(dir: string): Promise<PublishLog | null> {
  try {
    return PublishLogSchema.parse(JSON.parse(await readFile(path.join(dir, PUBLISH_LOG_FILE), 'utf8')))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** Evidence files modified after `since`. */
async function evidenceNewerThan(dir: string, since: string): Promise<string[]> {
  const folder = path.join(dir, SESSION_EVIDENCE_DIR)
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return []
  }
  const newer: string[] = []
  for (const name of names.sort()) {
    if (name === 'index.json') continue
    const info = await stat(path.join(folder, name))
    if (info.isFile() && info.mtimeMs > Date.parse(since)) newer.push(name)
  }
  return newer
}

export async function publishLogDiff(home: string, id: string): Promise<PublishDiff> {
  const { dir, repo, baseRef } = await load(home, id)
  const log = await readLog(dir)
  return diffAgainstLog(log, await currentHashes(repo, baseRef), log === null ? [] : await evidenceNewerThan(dir, log.publishedAt))
}

export async function publishLogWrite(options: { home: string; id: string; coveragePath?: string; now?: Date }): Promise<PublishLog> {
  const { dir, repo, baseRef } = await load(options.home, options.id)
  const previous = await readLog(dir)
  const input = options.coveragePath === undefined ? {} : CoverageInputSchema.parse(JSON.parse(await readFile(options.coveragePath, 'utf8')))
  const log: PublishLog = {
    publishedAt: (options.now ?? new Date()).toISOString(),
    head: (await gitText(repo, ['rev-parse', 'HEAD'])).trim(),
    files: await currentHashes(repo, baseRef),
    evidence: mergeCoverage(previous?.evidence ?? {}, input.evidence),
    extras: mergeCoverage(previous?.extras ?? {}, input.extras),
  }
  await writeJsonAtomic(path.join(dir, PUBLISH_LOG_FILE), log)
  return log
}

function formatDiff(diff: PublishDiff): string {
  if (diff.first) return 'no publish log: first publish, everything is new'
  const line = (label: string, items: string[]) => (items.length === 0 ? [] : [`${label}: ${items.join(', ')}`])
  const lines = [
    `published ${diff.publishedAt}`,
    ...line('changed', diff.changed),
    ...line('added', diff.added),
    ...line('dropped', diff.dropped),
    ...line('recapture evidence', diff.evidenceToRecapture),
    ...line('delete evidence', diff.evidenceToDelete),
    ...line('regenerate extras', diff.extrasToRegenerate),
    ...line('evidence refreshed since', diff.refreshedEvidence),
  ]
  return lines.length === 1 ? `${lines[0]}\nnothing changed` : lines.join('\n')
}

export function registerPublishLog(program: Command): void {
  const command = program.command('publish-log').description('Track what the last publish covered, for refreshing a published review')
  command
    .command('diff')
    .argument('<sessionId>', 'session id')
    .option('--json', 'print the diff as JSON')
    .description('Compare the session files with the last publish: changed, added, dropped, and the evidence and extras to redo')
    .action(async (id: string, flags: { json?: boolean }) => {
      const diff = await publishLogDiff(resolveHome(), id)
      console.log(flags.json === true ? JSON.stringify(diff, null, 2) : formatDiff(diff))
    })
  command
    .command('write')
    .argument('<sessionId>', 'session id')
    .option('--coverage <file.json>', 'JSON {evidence?, extras?}: file -> repo paths; merged over the previous log, an empty list removes an entry')
    .description('Record the current file hashes, HEAD and coverage as the new publish log')
    .action(async (id: string, flags: { coverage?: string }) => {
      const log = await publishLogWrite({ home: resolveHome(), id, ...(flags.coverage === undefined ? {} : { coveragePath: flags.coverage }) })
      console.log(`publish log written: ${Object.keys(log.files).length} files at ${log.head.slice(0, 12)}`)
    })
}
