// `ai-review checkpoint lookup|manifest`: the deterministic half of the snapshot-db skill. A database checkpoint is
// reusable only while the data setup (hash of its description) and the schema (hash of the tracked migration and seed
// files) are the same; this command computes both, finds the newest matching checkpoint and writes manifests.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { z } from 'zod'
import { headSha, topLevel } from '@scout/shared/git/repo'
import { gitText } from '@scout/shared/git/run'
import { resolveHome, sessionDir } from '../store.ts'
import { scratchDir } from './env.ts'

const MANIFEST = 'manifest.json'
const SETUP_COPY = 'setup.md'
const SNAPSHOTS_DIR = 'snapshots'
const SCHEMA_SEGMENT = /^(migrations?|seeds?|schema|prisma|db)$/i
const SCHEMA_FILE = /^schema\./i

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

const ManifestSchema = z.looseObject({ setupHash: z.string(), schemaHash: z.string() })

export interface CheckpointKey {
  setupHash: string
  schemaHash: string
  /** The paths the schema hash covers (given with --schema, or detected). */
  schemaPaths: string[]
  schemaPathsSource: 'flag' | 'auto' | 'none'
  head: string
}

export interface LookupResult extends CheckpointKey {
  found: string | null
  stale: { folder: string; reason: string }[]
  saveTo: string
}

/** The folder or file roots of tracked paths that define the schema or seeds: `…/migrations`, `db`, `schema.sql`. */
export function detectSchemaPaths(tracked: readonly string[]): string[] {
  const roots = new Set<string>()
  for (const file of tracked) {
    const parts = file.split('/')
    const at = parts.findIndex((part, i) => SCHEMA_SEGMENT.test(part) || (i === parts.length - 1 && SCHEMA_FILE.test(part)))
    if (at >= 0) roots.add(parts.slice(0, at + 1).join('/'))
  }
  return [...roots].sort()
}

export async function checkpointKey(options: { repo: string; setupFile: string; schema?: string[] }): Promise<CheckpointKey> {
  const repo = await topLevel(options.repo)
  const setupHash = sha256(await readFile(options.setupFile))
  let schemaPaths = options.schema ?? []
  let schemaPathsSource: CheckpointKey['schemaPathsSource'] = schemaPaths.length > 0 ? 'flag' : 'none'
  if (schemaPaths.length === 0) {
    schemaPaths = detectSchemaPaths((await gitText(repo, ['ls-files'])).split('\n').filter((l) => l !== ''))
    if (schemaPaths.length > 0) schemaPathsSource = 'auto'
  }
  const staged = schemaPaths.length === 0 ? '' : await gitText(repo, ['ls-files', '-s', '--', ...schemaPaths])
  return { setupHash, schemaHash: sha256(staged), schemaPaths, schemaPathsSource, head: await headSha(repo) }
}

/** UTC `yyyymmdd-hhmmss`. */
export function utcStamp(now: Date): string {
  return now.toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-')
}

async function checkpointsFolder(options: { home: string; repo: string; key: string; session?: string }): Promise<string> {
  if (/[/\\]/.test(options.key) || options.key === '' || options.key.startsWith('.')) throw new Error(`invalid setup key "${options.key}": use a plain name like approver-and-pending-model`)
  const base = options.session === undefined ? scratchDir(options.home, await topLevel(options.repo)) : sessionDir(options.home, options.session)
  return path.join(base, SNAPSHOTS_DIR, options.key)
}

export async function lookupCheckpoint(options: { home: string; repo: string; key: string; setupFile: string; session?: string; schema?: string[]; now?: Date }): Promise<LookupResult> {
  const key = await checkpointKey(options)
  const root = await checkpointsFolder(options)
  const names = await readdir(root).catch(() => [] as string[])
  let found: string | null = null
  const stale: LookupResult['stale'] = []
  for (const name of names.sort().reverse()) {
    const folder = path.join(root, name)
    let manifest: z.infer<typeof ManifestSchema>
    try {
      manifest = ManifestSchema.parse(JSON.parse(await readFile(path.join(folder, MANIFEST), 'utf8')))
    } catch {
      continue
    }
    const reasons = [
      ...(manifest.setupHash === key.setupHash ? [] : ['setup description changed']),
      ...(manifest.schemaHash === key.schemaHash ? [] : ['migration/seed files changed']),
    ]
    if (reasons.length === 0) {
      found = folder
      break
    }
    stale.push({ folder, reason: reasons.join(' and ') })
  }
  return { found, stale, ...key, saveTo: `${path.join(root, utcStamp(options.now ?? new Date()))}/` }
}

export function formatLookup(result: LookupResult): string {
  if (result.found !== null) return `Checkpoint: ${result.found}`
  return `Checkpoint: none (${result.stale[0] === undefined ? 'missing' : `stale: ${result.stale[0].reason}`})`
}

async function filesIn(folder: string, rel = ''): Promise<{ name: string; size: number; sha256: string }[]> {
  const out: { name: string; size: number; sha256: string }[] = []
  for (const entry of (await readdir(path.join(folder, rel), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) out.push(...(await filesIn(folder, name)))
    else if (entry.isFile() && name !== MANIFEST) {
      const data = await readFile(path.join(folder, name))
      out.push({ name, size: data.length, sha256: sha256(data) })
    }
  }
  return out
}

export interface ManifestOptions {
  repo: string
  folder: string
  key: string
  setupFile: string
  schema?: string[]
  engine: string
  database: string
  host: string
  dumpCommand: string
  restoreCommand: string
  countsFile?: string
  now?: Date
}

export async function writeManifest(options: ManifestOptions): Promise<Record<string, unknown>> {
  const key = await checkpointKey(options)
  await mkdir(options.folder, { recursive: true })
  const setupCopy = path.join(options.folder, SETUP_COPY)
  if (!(await stat(setupCopy).catch(() => null))) await copyFile(options.setupFile, setupCopy)
  const counts: unknown = options.countsFile === undefined ? {} : JSON.parse(await readFile(options.countsFile, 'utf8'))
  const manifest = {
    key: options.key,
    ...key,
    createdAt: (options.now ?? new Date()).toISOString(),
    engine: options.engine,
    database: options.database,
    host: options.host,
    dumpCommand: options.dumpCommand,
    restoreCommand: options.restoreCommand,
    files: await filesIn(options.folder),
    counts,
  }
  await writeFile(path.join(options.folder, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

interface LookupFlags {
  setup: string
  session?: string
  schema?: string[]
  repo?: string
  json?: boolean
}

interface ManifestFlags {
  key: string
  setup: string
  schema?: string[]
  engine: string
  database: string
  host: string
  dumpCommand: string
  restoreCommand: string
  counts?: string
  repo?: string
}

export function registerCheckpoint(program: Command): void {
  const checkpoint = program.command('checkpoint').description('Database checkpoints for the snapshot-db skill: find a matching one, write its manifest')
  checkpoint
    .command('lookup')
    .argument('<setup-key>', 'name of the data setup')
    .requiredOption('--setup <file>', 'the setup description (prerequisites and steps as text)')
    .option('--session <id>', 'keep checkpoints in this session folder (default: the checkout scratch folder)')
    .option('--schema <path...>', 'tracked migration/seed paths that define the schema (default: detected)')
    .option('--repo <path>', 'path inside the checkout (default: cwd)')
    .option('--json', 'print JSON')
    .description('Find the newest checkpoint whose setup and schema hashes match, and the folder a new one goes to')
    .action(async (key: string, flags: LookupFlags) => {
      const result = await lookupCheckpoint({
        home: resolveHome(),
        repo: path.resolve(flags.repo ?? process.cwd()),
        key,
        setupFile: path.resolve(flags.setup),
        ...(flags.session === undefined ? {} : { session: flags.session }),
        ...(flags.schema === undefined ? {} : { schema: flags.schema }),
      })
      console.log(flags.json === true ? JSON.stringify(result, null, 2) : `${formatLookup(result)}\nSave to: ${result.saveTo}\nSchema paths (${result.schemaPathsSource}): ${result.schemaPaths.join(', ') || 'none'}`)
    })
  checkpoint
    .command('manifest')
    .argument('<folder>', 'the checkpoint folder holding the dump files')
    .requiredOption('--key <key>', 'setup key')
    .requiredOption('--setup <file>', 'the setup description')
    .option('--schema <path...>', 'tracked migration/seed paths that define the schema (default: detected)')
    .requiredOption('--engine <engine>', 'mysql, postgres, mongo, sqlite, …')
    .requiredOption('--database <name>', 'database name')
    .requiredOption('--host <host>', 'host the database was dumped from')
    .requiredOption('--dump-command <command>', 'the command that produced the dump')
    .requiredOption('--restore-command <command>', 'the command that puts it back')
    .option('--counts <file>', 'JSON file with row/document counts per table')
    .option('--repo <path>', 'path inside the checkout (default: cwd)')
    .description('Write manifest.json (hashes, head, files with size and sha256, counts) and copy the setup description to setup.md')
    .action(async (folder: string, flags: ManifestFlags) => {
      const manifest = await writeManifest({
        repo: path.resolve(flags.repo ?? process.cwd()),
        folder: path.resolve(folder),
        key: flags.key,
        setupFile: path.resolve(flags.setup),
        engine: flags.engine,
        database: flags.database,
        host: flags.host,
        dumpCommand: flags.dumpCommand,
        restoreCommand: flags.restoreCommand,
        ...(flags.schema === undefined ? {} : { schema: flags.schema }),
        ...(flags.counts === undefined ? {} : { countsFile: path.resolve(flags.counts) }),
      })
      console.log(JSON.stringify(manifest, null, 2))
    })
}
