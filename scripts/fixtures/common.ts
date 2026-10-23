// Shared plumbing for the fixture modules: output paths, the deterministic git environment, file
// writers, and small helpers for building review state and session folders.
import { access, cp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SCHEMA_VERSION,
  type Comment,
  type CommentTarget,
  type EvidenceIndex,
  type ExtrasIndex,
  type FileReview,
  type CodeReviewManifest,
  type Manifest,
  type SpecIndex,
  type Verdict,
  type WorkingTree,
} from '@review-dash/shared'
import { gitText } from '@review-dash/shared/git/run'
import { writeJsonAtomic, writeManifest } from '../../cli/src/store.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const fixturesDir = path.join(root, 'fixtures')
/** Output store; `FIXTURE_OUT` lets the e2e run build a throwaway copy instead of `fixtures/store`. */
export const storeDir = process.env.FIXTURE_OUT ? path.resolve(process.env.FIXTURE_OUT) : path.join(fixturesDir, 'store')
export const reposDir = path.join(storeDir, 'repos')
export const inputDir = path.join(fixturesDir, 'src')
export const mediaDir = path.join(fixturesDir, 'media')

/** Web origin written into sent markdown; `DASHBOARD_ORIGIN` overrides it. */
export const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN ?? 'http://scout.localhost:4546'
export const BASE_REF = 'origin/master'

export const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture Bot',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture Bot',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-09-25T10:00:00Z',
  GIT_COMMITTER_DATE: '2026-09-25T10:00:00Z',
}

export function git(cwd: string, args: string[]): Promise<string> {
  return gitText(cwd, args, { env: GIT_ENV })
}

export async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  )
}

export async function writeFiles(dir: string, files: Record<string, string | Buffer>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'))
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }
}

/** A second working copy of a repo (same bare origin) so one session's edits leave the others alone. */
export async function copyRepo(from: string, name: string): Promise<string> {
  const to = path.join(reposDir, name)
  await cp(from, to, { recursive: true })
  return to
}

function sessionDir(id: string): string {
  return path.join(storeDir, 'sessions', id)
}

export interface ManifestInput {
  id: string
  title: string
  repo: string
  origin: string | null
  branch: string | null
  createdAt: string
  tickets?: Manifest['tickets']
  agentSessionId?: string | null
}

export function makeManifest(input: ManifestInput): CodeReviewManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    agent: { type: 'claude-code', sessionId: input.agentSessionId ?? null, cliVersion: null, entrypoint: 'cli' },
    repo: { path: input.repo, remote: input.origin, branch: input.branch, baseRef: BASE_REF },
    tickets: input.tickets ?? [],
  }
}

/** One file of an artifact folder: inline text, a Buffer, or a path to copy from. */
export type ArtifactFile = { file: string; text: string } | { file: string; bytes: Buffer } | { file: string; from: string }

export interface SessionArtifacts {
  evidence?: { files: ArtifactFile[]; index: EvidenceIndex | null }
  extras?: { files: ArtifactFile[]; index: ExtrasIndex | null }
  spec?: { files: ArtifactFile[]; index: SpecIndex | null }
  prDescription?: string
}

async function writeArtifactFolder(dir: string, files: ArtifactFile[], index: unknown): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const item of files) {
    const target = path.join(dir, ...item.file.split('/'))
    await mkdir(path.dirname(target), { recursive: true })
    if ('from' in item) await cp(item.from, target)
    else if ('bytes' in item) await writeFile(target, item.bytes)
    else await writeFile(target, item.text)
  }
  if (index !== null) await writeJsonAtomic(path.join(dir, 'index.json'), index)
}

/**
 * Writes a session folder (live by default, or under `archive/` with `inArchive`): the manifest, an
 * empty `review/`, and whichever artifact folders are given. Returns the folder.
 */
export async function writeSessionFolder(manifest: Manifest, artifacts: SessionArtifacts, inArchive = false): Promise<string> {
  const dir = inArchive ? path.join(storeDir, 'archive', manifest.id) : sessionDir(manifest.id)
  await mkdir(path.join(dir, 'review'), { recursive: true })
  await writeManifest(dir, manifest)
  if (artifacts.evidence) await writeArtifactFolder(path.join(dir, 'evidence'), artifacts.evidence.files, artifacts.evidence.index)
  if (artifacts.extras) await writeArtifactFolder(path.join(dir, 'extras'), artifacts.extras.files, artifacts.extras.index)
  if (artifacts.spec) await writeArtifactFolder(path.join(dir, 'spec'), artifacts.spec.files, artifacts.spec.index)
  if (artifacts.prDescription !== undefined) await writeFile(path.join(dir, 'pr-description.md'), artifacts.prDescription)
  return dir
}

export function fingerprintOf(tree: WorkingTree, file: string): string {
  const entry = tree.files.find((f) => f.path === file)
  if (entry === undefined) throw new Error(`make-fixture: ${file} is not in the computed tree`)
  return entry.fingerprint
}

export function judged(tree: WorkingTree, file: string, verdict: Exclude<Verdict, 'none'>): FileReview {
  return { verdict, fingerprint: fingerprintOf(tree, file), viewed: true }
}

export function makeComment(id: string, target: CommentTarget, body: string, createdAt: string, timestampSec: number | null = null): Comment {
  return { id, target, body, timestampSec, createdAt, updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null }
}

// ---------------------------------------------------------------------------------------------
// The printed summary

export interface SessionReport {
  id: string
  title: string
  covers: string
  repo: string
  tree: WorkingTree | null
  archived?: boolean
}

function describeTree(tree: WorkingTree): string {
  const flags = tree.files.map((f) => `${f.path}${f.untracked ? ' (untracked)' : ''}${f.collapsed ? ' (collapsed)' : ''}${f.binary ? ' (binary)' : ''}`)
  return [
    `  base ${tree.baseRef} @ ${tree.baseSha.slice(0, 12)} · head ${tree.headSha.slice(0, 12)} · ${tree.branch ?? 'detached'} · dirty: ${tree.dirty} · ${tree.durationMs} ms`,
    `  stats: ${JSON.stringify(tree.stats)}`,
    `  files: ${flags.length === 0 ? '(none)' : flags.join(', ')}`,
  ].join('\n')
}

export function printSummary(reports: readonly SessionReport[]): void {
  console.log('')
  console.log(`make-fixture: ${reports.length} sessions in ${storeDir}`)
  for (const report of reports) {
    console.log('')
    console.log(`${report.archived ? '[archived] ' : ''}${report.id}`)
    console.log(`  title: ${report.title}`)
    console.log(`  covers: ${report.covers}`)
    console.log(`  repo: ${report.repo}`)
    if (report.tree !== null) console.log(describeTree(report.tree))
  }
}
