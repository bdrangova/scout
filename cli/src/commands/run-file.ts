// `scout run-file add|refresh`: copies the test plan and the bug folders into a test-run session's run folder
// (`run/plan/test-plan.md`, `run/bugs/<slug>/...`), so the dashboard only ever reads inside the run. The source of each copy is
// recorded in the manifest (`run.sources`) and `refresh` copies them again.
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { runFolderOf, type TestRunManifest } from '@scout/shared'
import { resolveHome, sessionDir, writeManifest } from '../store.ts'
import { liveTestRun } from './init-test-run.ts'

const PLAN_DIR = 'plan'
const PLAN_FILE = 'test-plan.md'
const BUGS_DIR = 'bugs'
const SKIPPED_NAMES: ReadonlySet<string> = new Set(['.DS_Store'])
const SLUG_RE = /^[A-Za-z0-9][\w.-]*$/

type Sources = NonNullable<TestRunManifest['run']['sources']>
type RunFileStatus = 'added' | 'updated' | 'unchanged' | 'missing'

export interface RunFileResult {
  /** `plan`, or `bug:<slug>`. */
  item: string
  status: RunFileStatus
  source: string
  /** Absolute path of the copy (inside the run folder). */
  copy: string
}

interface LoadedRun {
  dir: string
  runPath: string
  manifest: TestRunManifest
}

async function loadRun(home: string, id: string): Promise<LoadedRun> {
  const manifest = await liveTestRun(home, id)
  const dir = sessionDir(home, id)
  return { dir, runPath: runFolderOf(dir), manifest }
}

async function saveSources(run: LoadedRun, sources: Sources): Promise<void> {
  await writeManifest(run.dir, { ...run.manifest, run: { ...run.manifest.run, sources } })
}

async function sha(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex')
  } catch {
    return null
  }
}

/** The files of a folder as `relative path` → file path, symlinks to files inside the folder followed, everything else a symlink refused. */
async function listFiles(root: string): Promise<Map<string, string>> {
  const realRoot = await realpath(root)
  const files = new Map<string, string>()
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIPPED_NAMES.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(full, rel)
      else if (entry.isFile()) files.set(rel, full)
      else if (entry.isSymbolicLink()) {
        const target = await realpath(full).catch(() => null)
        if (target === null || (target !== realRoot && !target.startsWith(realRoot + path.sep))) throw new Error(`${full} is a symlink that points outside ${root}; not copied`)
        if (!(await stat(target)).isFile()) throw new Error(`${full} is a symlink to a folder; not copied (put the real files in the bug folder)`)
        files.set(rel, target)
      }
    }
  }
  await walk(root, '')
  return files
}

async function digestOf(files: ReadonlyMap<string, string>): Promise<string> {
  const hash = createHash('sha256')
  for (const rel of [...files.keys()].sort()) hash.update(`${rel}\0${(await sha(files.get(rel) ?? '')) ?? ''}\0`)
  return hash.digest('hex')
}

async function folderDigest(dir: string): Promise<string | null> {
  try {
    return await digestOf(await listFiles(dir))
  } catch {
    return null
  }
}

function assertOutsideRun(runPath: string, source: string): void {
  if (source === runPath || source.startsWith(runPath + path.sep)) throw new Error(`${source} is inside the run folder already; give the original location`)
}

async function copyPlan(runPath: string, source: string): Promise<{ status: 'added' | 'updated' | 'unchanged'; copy: string }> {
  assertOutsideRun(runPath, source)
  if (!(await stat(source).catch(() => null))?.isFile()) throw new Error(`test plan ${source} is not a file`)
  const copy = path.join(runPath, PLAN_DIR, PLAN_FILE)
  const before = await sha(copy)
  if (before !== null && before === (await sha(source))) return { status: 'unchanged', copy }
  await mkdir(path.dirname(copy), { recursive: true })
  const tmp = `${copy}.${process.pid}.tmp`
  await copyFile(source, tmp)
  await rename(tmp, copy)
  return { status: before === null ? 'added' : 'updated', copy }
}

async function copyBug(runPath: string, slug: string, source: string): Promise<{ status: 'added' | 'updated' | 'unchanged'; copy: string }> {
  assertOutsideRun(runPath, source)
  const files = await listFiles(source)
  const copy = path.join(runPath, BUGS_DIR, slug)
  const before = await folderDigest(copy)
  if (before !== null && before === (await digestOf(files))) return { status: 'unchanged', copy }
  const tmp = path.join(runPath, BUGS_DIR, `.${slug}.${process.pid}.tmp`)
  await rm(tmp, { recursive: true, force: true })
  try {
    for (const [rel, file] of files) {
      const target = path.join(tmp, ...rel.split('/'))
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(file, target)
    }
    await mkdir(tmp, { recursive: true })
    await rm(copy, { recursive: true, force: true })
    await rename(tmp, copy)
  } catch (error) {
    await rm(tmp, { recursive: true, force: true })
    throw error
  }
  return { status: before === null ? 'added' : 'updated', copy }
}

export async function addPlanFile(options: { home: string; id: string; file: string }): Promise<RunFileResult> {
  const run = await loadRun(options.home, options.id)
  const source = await realpath(path.resolve(options.file)).catch(() => {
    throw new Error(`test plan ${path.resolve(options.file)} does not exist`)
  })
  const { status, copy } = await copyPlan(run.runPath, source)
  await saveSources(run, { ...run.manifest.run.sources, plan: source })
  return { item: 'plan', status, source, copy }
}

export async function addBugFolder(options: { home: string; id: string; folder: string }): Promise<RunFileResult> {
  const run = await loadRun(options.home, options.id)
  const source = await realpath(path.resolve(options.folder)).catch(() => {
    throw new Error(`bug folder ${path.resolve(options.folder)} does not exist`)
  })
  if (!(await lstat(source)).isDirectory()) throw new Error(`bug folder ${source} is not a folder`)
  const slug = path.basename(source)
  if (!SLUG_RE.test(slug)) throw new Error(`bug folder name "${slug}" cannot be used as a slug (letters, digits, "-", "_", "."; it must start with a letter or digit)`)
  const { status, copy } = await copyBug(run.runPath, slug, source)
  await saveSources(run, { ...run.manifest.run.sources, bugs: { ...run.manifest.run.sources?.bugs, [slug]: source } })
  return { item: `bug:${slug}`, status, source, copy }
}

/** Copies every recorded source again; a source that is gone is reported as `missing` and its copy and record are kept. */
export async function refreshRunFiles(options: { home: string; id: string }): Promise<RunFileResult[]> {
  const run = await loadRun(options.home, options.id)
  const results: RunFileResult[] = []
  const sources = run.manifest.run.sources
  const plan = sources?.plan
  if (plan !== undefined) {
    const copy = path.join(run.runPath, PLAN_DIR, PLAN_FILE)
    if ((await stat(plan).catch(() => null))?.isFile()) results.push({ item: 'plan', source: plan, ...(await copyPlan(run.runPath, plan)) })
    else results.push({ item: 'plan', status: 'missing', source: plan, copy })
  }
  for (const [slug, source] of Object.entries(sources?.bugs ?? {})) {
    const item = `bug:${slug}`
    const copy = path.join(run.runPath, BUGS_DIR, slug)
    if ((await stat(source).catch(() => null))?.isDirectory()) results.push({ item, source, ...(await copyBug(run.runPath, slug, source)) })
    else results.push({ item, status: 'missing', source, copy })
  }
  return results
}

function print(results: readonly RunFileResult[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ results }, null, 2))
    return
  }
  if (results.length === 0) console.log('nothing recorded to refresh')
  for (const result of results) console.log(`${result.status.padEnd(9)} ${result.item}  ${result.source}${result.status === 'missing' ? '  (source is gone; the copy is kept)' : ` -> ${result.copy}`}`)
}

interface JsonFlag {
  json?: boolean
}

export function registerRunFile(program: Command): void {
  const command = program.command('run-file').description("Copy the test plan and bug folders into a test run's run folder")

  command
    .command('add')
    .argument('<id>', 'test-run session id')
    .argument('<kind>', 'plan | bug')
    .argument('<path>', 'plan: the test plan file (copied to run/plan/test-plan.md); bug: the bug folder (copied to run/bugs/<folder name>/)')
    .option('--json', 'print the result as json')
    .description('Copy a test plan file or a bug folder into the run folder and record where it came from')
    .action(async (id: string, kind: string, source: string, flags: JsonFlag) => {
      if (kind !== 'plan' && kind !== 'bug') throw new Error(`<kind> must be plan or bug, got "${kind}"`)
      const home = resolveHome()
      const result = kind === 'plan' ? await addPlanFile({ home, id, file: source }) : await addBugFolder({ home, id, folder: source })
      print([result], flags.json === true)
    })

  command
    .command('refresh')
    .argument('<id>', 'test-run session id')
    .option('--json', 'print the result as json')
    .description('Copy every recorded plan and bug source again; sources that are gone are reported')
    .action(async (id: string, flags: JsonFlag) => {
      print(await refreshRunFiles({ home: resolveHome(), id }), flags.json === true)
    })
}
