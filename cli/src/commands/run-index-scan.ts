// `scout run-index scan`: the mechanical part of reading a test run (folders, evidence, log excerpts, hashes).
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { TEST_RUN_INDEX_FILE } from '@scout/shared'
import { z } from 'zod'
import type { IndexOwner } from './run-index-merge.ts'

const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_RANGE_LINES = 40
const MAX_RANGES_PER_SCENARIO = 3
const MERGE_GAP = 3
const VIDEO_EXTS = ['.mp4', '.webm']
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg']
const MEDIA_EXTS = [...VIDEO_EXTS, ...IMAGE_EXTS, '.gif']

export interface EvidenceItem {
  path: string
  caption: string
  layer?: string
}
export interface ScenarioEvidence {
  videos: EvidenceItem[]
  screenshots: EvidenceItem[]
  data: EvidenceItem[]
}
export interface LogExcerptItem {
  path: string
  from: number
  to: number
  label: string
}
export type FolderState = 'current' | 'superseded' | 'ignored'
export interface ScenarioFolder {
  folder: string
  id: string | null
  state: FolderState
  /** Why a folder is ignored or not current. */
  reason?: string
}
export interface ScannedScenario {
  id: string
  /** The current folder, or null when the id has none (or only superseded ones). */
  folder: string | null
  onlySuperseded: boolean
  evidence: ScenarioEvidence
  logExcerpts: LogExcerptItem[]
}
export interface ScanHashDiff {
  /** True when the owner has no recorded hashes: everything is new. */
  first: boolean
  changed: string[]
  added: string[]
  dropped: string[]
}
export interface RunScan {
  run: string
  indexExists: boolean
  scenarioFolders: ScenarioFolder[]
  scenarios: ScannedScenario[]
  logs: { path: string; label: string }[]
  dataSetup: { videos: EvidenceItem[]; screenshots: EvidenceItem[]; snapshotPath: string | null }
  hashes: Record<string, string>
  diff: ScanHashDiff | null
}

/** `s9-tables`, `S9-clean`, `_s5-superseded` give 9, 9 and 5; null when the name holds no `S<N>`. */
export function scenarioIdFromFolder(name: string): string | null {
  const match = /(?:^|[^a-z0-9])s(\d+)(?!\d)/i.exec(name)
  return match?.[1] === undefined ? null : `S${Number(match[1])}`
}

export function isSupersededFolder(name: string): boolean {
  return name.startsWith('_') || /-superseded/i.test(name)
}

function idNumber(id: string): number {
  const n = Number(/\d+/.exec(id)?.[0])
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/** Classifies `scenarios/*` folders: one current folder per id (the first by name), the rest superseded or ignored. */
export function classifyFolders(names: readonly string[]): ScenarioFolder[] {
  const sorted = [...names].sort()
  const currentOf = new Map<string, string>()
  return sorted.map((folder): ScenarioFolder => {
    const id = scenarioIdFromFolder(folder)
    if (id === null) return { folder, id, state: 'ignored', reason: 'no S<N> in the name' }
    if (isSupersededFolder(folder)) return { folder, id, state: 'superseded' }
    const taken = currentOf.get(id)
    if (taken !== undefined) return { folder, id, state: 'ignored', reason: `${taken} is already the current folder of ${id}` }
    currentOf.set(id, folder)
    return { folder, id, state: 'current' }
  })
}

/**
 * Folder ids use the index's own id for the same number when the index has exactly one (`s1-pass`, `S1-login`),
 * so a run whose plan named its scenarios differently is not listed twice.
 */
export function alignWithIndex(folders: readonly ScenarioFolder[], indexIds: readonly string[]): ScenarioFolder[] {
  const byNumber = new Map<string, string[]>()
  for (const id of indexIds) {
    const key = scenarioIdFromFolder(id)
    if (key !== null) byNumber.set(key, [...(byNumber.get(key) ?? []), id])
  }
  return folders.map((folder) => {
    const match = folder.id === null ? undefined : byNumber.get(folder.id)
    return match?.length === 1 ? { ...folder, id: match[0]! } : folder
  })
}

/** File-name prefix to layer name: `l1-` is L1-2, `l3-` is L3, `e2e-` is E2E. */
export function layerFromFileName(name: string): { layer: string; rest: string } | null {
  const match = /^(l1(?:-2)?|l3|e2e)-(.*)$/i.exec(name)
  const prefix = match?.[1]?.toLowerCase()
  if (match === null || prefix === undefined) return null
  return { layer: prefix === 'e2e' ? 'E2E' : prefix === 'l3' ? 'L3' : 'L1-2', rest: match[2] ?? '' }
}

/**
 * A short caption from a file name: the layer prefix, the `s<N>`/`d<N>` id, the step number and a one-letter sub-step are
 * dropped (`e2e-s1-02-b-result-expanded.png` gives "Result expanded"); with `withDataId` a `d<N>` id leads
 * (`e2e-d1-03-prc3-saved-draft-v1.2.png` gives "D1: Prc3 saved draft v1.2").
 */
export function captionFromFileName(fileName: string, options: { withDataId?: boolean } = {}): string {
  const base = fileName.replace(/\.[^./]+$/, '')
  const stripped = layerFromFileName(base)?.rest ?? base
  const tokens = stripped.split(/[-_\s]+/).filter((token) => token !== '')
  let dataId: string | null = null
  const idAt = tokens.findIndex((token) => /^[sd]\d+$/i.test(token))
  if (idAt !== -1) {
    const id = tokens[idAt] ?? ''
    if (options.withDataId && id.toLowerCase().startsWith('d')) dataId = id.toUpperCase()
    tokens.splice(idAt, 1)
    if (/^\d+$/.test(tokens[idAt] ?? '')) {
      tokens.splice(idAt, 1)
      if (/^[a-z]$/i.test(tokens[idAt] ?? '')) tokens.splice(idAt, 1)
    }
  }
  const words = tokens.join(' ')
  const text = words === '' ? base : `${words.charAt(0).toUpperCase()}${words.slice(1)}`
  return dataId === null ? text : `${dataId}: ${text}`
}

/** Ranges from matching line numbers (1-based, ascending): hits at most 3 lines apart merge, each side gets one line, a range holds at most 40 lines. */
export function mergeHitRanges(hits: readonly number[], totalLines: number): { from: number; to: number; firstHit: number }[] {
  const groups: number[][] = []
  for (const hit of hits) {
    const last = groups.at(-1)
    if (last !== undefined && hit - (last.at(-1) ?? hit) <= MERGE_GAP) last.push(hit)
    else groups.push([hit])
  }
  return groups.map((group) => {
    const firstHit = group[0] ?? 1
    const from = Math.max(1, firstHit - 1)
    const to = Math.min(totalLines, (group.at(-1) ?? firstHit) + 1, from + MAX_RANGE_LINES - 1)
    return { from, to, firstHit }
  })
}

function firstWords(line: string): string {
  const words = line.replace(/[#*`|>]+/g, ' ').trim().split(/\s+/).slice(0, 8).join(' ')
  return words.length > 60 ? `${words.slice(0, 57)}...` : words
}

function idRegExp(id: string): RegExp {
  return new RegExp(`\\b${id}\\b`)
}

/** Excerpt ranges of one scenario id in one log file's lines. */
export function logRangesForId(id: string, lines: readonly string[], file: string): LogExcerptItem[] {
  const re = idRegExp(id)
  const hits = lines.flatMap((line, i) => (re.test(line) ? [i + 1] : []))
  return mergeHitRanges(hits, lines.length).map(({ from, to, firstHit }) => ({
    path: `run:logs/${file}`,
    from,
    to,
    label: `${file}: ${firstWords(lines[firstHit - 1] ?? '')}`,
  }))
}

/** `layer4-e2e-results.md` gives "layer4 e2e results"; a `.log` keeps a suffix to tell it from a notes file. */
export function logLabel(file: string): string {
  const ext = path.extname(file)
  const words = path.basename(file, ext).replace(/[-_]+/g, ' ').trim()
  return ext === '.log' ? `${words} (log)` : words
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
}

function extOf(name: string): string {
  return path.extname(name).toLowerCase()
}

/** Videos by name, `.webm` only when no `.mp4` of the same name exists. */
function pickVideos(files: readonly string[]): string[] {
  const mp4 = new Set(files.filter((f) => extOf(f) === '.mp4').map((f) => f.slice(0, -4)))
  return files.filter((f) => extOf(f) === '.mp4' || (extOf(f) === '.webm' && !mp4.has(f.slice(0, -5))))
}

function evidenceItem(ref: string, fileName: string, withDataId = false): EvidenceItem {
  const layer = layerFromFileName(fileName.replace(/\.[^./]+$/, ''))?.layer
  const item: EvidenceItem = { path: ref, caption: captionFromFileName(fileName, { withDataId }) }
  if (layer !== undefined) item.layer = layer
  return item
}

async function scanEvidence(runPath: string, folder: string): Promise<ScenarioEvidence> {
  const base = path.join(runPath, 'scenarios', folder)
  const ref = (sub: string, file: string): string => `run:scenarios/${folder}/${sub}/${file}`
  const videos = pickVideos(await listFiles(path.join(base, 'videos')))
  const shots = (await listFiles(path.join(base, 'screenshots'))).filter((f) => extOf(f) === '.png')
  const data = (await listFiles(path.join(base, 'data'))).filter((f) => extOf(f) === '.json')
  return {
    videos: videos.map((f) => evidenceItem(ref('videos', f), f)),
    screenshots: shots.map((f) => evidenceItem(ref('screenshots', f), f)),
    data: data.map((f) => evidenceItem(ref('data', f), f)),
  }
}

interface LogFile {
  name: string
  lines: string[]
}

async function readLogFiles(runPath: string): Promise<{ readable: LogFile[]; nonEmpty: string[] }> {
  const dir = path.join(runPath, 'logs')
  const names = (await listFiles(dir)).filter((f) => ['.log', '.md'].includes(extOf(f)))
  const readable: LogFile[] = []
  const nonEmpty: string[] = []
  for (const name of names) {
    const info = await stat(path.join(dir, name))
    if (info.size === 0) continue
    nonEmpty.push(name)
    if (info.size > MAX_LOG_BYTES) continue
    readable.push({ name, lines: (await readFile(path.join(dir, name), 'utf8')).replace(/\n$/, '').split('\n') })
  }
  return { readable, nonEmpty }
}

async function scanDataSetup(runPath: string): Promise<RunScan['dataSetup']> {
  const dir = path.join(runPath, 'data-setup')
  const visible = (names: string[]): string[] => names.filter((f) => !f.startsWith('_'))
  const sub = async (name: string): Promise<string[]> => (name.startsWith('_') ? [] : visible(await listFiles(path.join(dir, name))))
  const videos = [
    ...pickVideos(visible(await listFiles(dir))).map((f) => ({ file: f, ref: `run:data-setup/${f}` })),
    ...pickVideos(await sub('videos')).map((f) => ({ file: f, ref: `run:data-setup/videos/${f}` })),
  ]
  const shots = (await sub('screenshots')).filter((f) => IMAGE_EXTS.includes(extOf(f)))
  const snapshots = path.join(runPath, 'db-snapshots')
  const entries = await readdir(snapshots, { withFileTypes: true }).catch(() => [])
  const dated = await Promise.all(entries.map(async (entry) => ({ name: entry.name, mtime: (await stat(path.join(snapshots, entry.name))).mtimeMs })))
  dated.sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1))
  const newest = dated[0]
  return {
    videos: videos.map(({ file, ref }) => evidenceItem(ref, file, true)),
    screenshots: shots.map((f) => evidenceItem(`run:data-setup/screenshots/${f}`, f, true)),
    snapshotPath: newest === undefined ? null : path.join(snapshots, newest.name),
  }
}

/** True when `parts` joined onto the run folder stay inside it (an index that is not valid yet may name `..`). */
function isInsideRun(run: string, ...parts: string[]): boolean {
  const relative = path.relative(run, path.resolve(run, ...parts))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function sha16(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

/** Text files hash to the first 16 hex of their sha256, media to `size:<bytes>`; null when the file is missing. */
export async function hashFile(file: string): Promise<string | null> {
  try {
    if (MEDIA_EXTS.includes(extOf(file))) return `size:${(await stat(file)).size}`
    return sha16(await readFile(file))
  } catch {
    return null
  }
}

const IndexHintSchema = z.looseObject({
  scenarios: z.array(z.looseObject({ id: z.string() })).catch([]),
  roots: z.record(z.string(), z.string()).catch({}),
  bugs: z.array(z.looseObject({ path: z.string() })).catch([]),
  publishedBy: z
    .looseObject({
      plan: z.looseObject({ hashes: z.record(z.string(), z.string()).optional() }).optional().catch(undefined),
      dataSetup: z.looseObject({ hashes: z.record(z.string(), z.string()).optional() }).optional().catch(undefined),
      run: z.looseObject({ hashes: z.record(z.string(), z.string()).optional() }).optional().catch(undefined),
    })
    .catch({}),
})

const PUBLISHED_KEY = { plan: 'plan', 'data-setup': 'dataSetup', run: 'run' } as const

/** Which hash keys a skill reads: the plan skill the plan, the data-setup skill the notes and data-setup files, the run skill all but data-setup. */
export function ownerHashKeys(owner: IndexOwner, keys: readonly string[]): string[] {
  return keys.filter((key) => {
    if (owner === 'plan') return key.startsWith('plan:')
    if (owner === 'data-setup') return key === 'steps.md' || key.startsWith('logs/') || key.startsWith('data-setup/') || key.startsWith('plan:')
    return !key.startsWith('data-setup/')
  })
}

export function diffHashes(current: Record<string, string>, previous: Record<string, string> | undefined): ScanHashDiff {
  if (previous === undefined) return { first: true, changed: [], added: Object.keys(current), dropped: [] }
  const keys = Object.keys(current)
  return {
    first: false,
    changed: keys.filter((key) => previous[key] !== undefined && previous[key] !== current[key]),
    added: keys.filter((key) => previous[key] === undefined),
    dropped: Object.keys(previous).filter((key) => current[key] === undefined),
  }
}

function mediaFilesOf(item: EvidenceItem): string {
  return item.path.slice('run:'.length)
}

export async function scanRun(runPath: string, owner: IndexOwner | null): Promise<RunScan> {
  const run = path.resolve(runPath)
  let hint: z.infer<typeof IndexHintSchema> | null = null
  try {
    hint = IndexHintSchema.parse(JSON.parse(await readFile(path.join(run, TEST_RUN_INDEX_FILE), 'utf8')))
  } catch {
    hint = null
  }

  const scenarioFolders = alignWithIndex(classifyFolders(await listDirs(path.join(run, 'scenarios'))), hint?.scenarios.map((s) => s.id) ?? [])
  const ids = new Set<string>([...scenarioFolders.flatMap((f) => (f.id === null ? [] : [f.id])), ...(hint?.scenarios.map((s) => s.id) ?? [])])
  const logFiles = await readLogFiles(run)
  const scenarios: ScannedScenario[] = []
  for (const id of [...ids].sort((a, b) => idNumber(a) - idNumber(b) || (a < b ? -1 : 1))) {
    const current = scenarioFolders.find((f) => f.id === id && f.state === 'current')
    const onlySuperseded = current === undefined && scenarioFolders.some((f) => f.id === id && f.state === 'superseded')
    const evidence = current === undefined ? { videos: [], screenshots: [], data: [] } : await scanEvidence(run, current.folder)
    const logExcerpts = logFiles.readable.flatMap((file) => logRangesForId(id, file.lines, file.name)).slice(0, MAX_RANGES_PER_SCENARIO)
    scenarios.push({ id, folder: current?.folder ?? null, onlySuperseded, evidence, logExcerpts })
  }

  const hashes: Record<string, string> = {}
  const put = async (key: string, file: string): Promise<void> => {
    const hash = await hashFile(file)
    if (hash !== null) hashes[key] = hash
  }
  await put('steps.md', path.join(run, 'steps.md'))
  for (const name of logFiles.nonEmpty) await put(`logs/${name}`, path.join(run, 'logs', name))
  for (const scenario of scenarios) {
    for (const item of [...scenario.evidence.videos, ...scenario.evidence.screenshots, ...scenario.evidence.data]) {
      await put(mediaFilesOf(item), path.join(run, mediaFilesOf(item)))
    }
  }
  const dataSetup = await scanDataSetup(run)
  for (const item of [...dataSetup.videos, ...dataSetup.screenshots]) await put(mediaFilesOf(item), path.join(run, mediaFilesOf(item)))
  const planRoot = hint?.roots['plan'] ?? 'plan'
  if (isInsideRun(run, planRoot)) await put('plan:test-plan.md', path.resolve(run, planRoot, 'test-plan.md'))
  const bugsRoot = hint?.roots['bugs'] ?? 'bugs'
  for (const bug of hint?.bugs ?? []) {
    const rest = bug.path.startsWith('bugs:') ? bug.path.slice('bugs:'.length) : null
    if (rest !== null && isInsideRun(run, bugsRoot, rest)) await put(bug.path, path.resolve(run, bugsRoot, rest))
  }

  const keys = owner === null ? Object.keys(hashes) : ownerHashKeys(owner, Object.keys(hashes))
  const owned = Object.fromEntries(keys.map((key) => [key, hashes[key] ?? '']))
  const previous = owner === null ? undefined : hint?.publishedBy[PUBLISHED_KEY[owner]]?.hashes
  return {
    run,
    indexExists: hint !== null,
    scenarioFolders,
    scenarios,
    logs: logFiles.nonEmpty.map((name) => ({ path: `run:logs/${name}`, label: logLabel(name) })),
    dataSetup,
    hashes: owned,
    diff: owner === null ? null : diffHashes(owned, previous),
  }
}

/** A short text summary of a scan, for people. */
export function formatScan(scan: RunScan): string {
  const lines = [`run ${scan.run}`, `index: ${scan.indexExists ? 'exists' : 'none yet'}`]
  lines.push('folders:', ...scan.scenarioFolders.map((f) => `  ${f.folder}  ${f.id ?? '-'}  ${f.state}${f.reason === undefined ? '' : ` (${f.reason})`}`))
  lines.push('scenarios:')
  for (const s of scan.scenarios) {
    const e = s.evidence
    lines.push(`  ${s.id}  ${s.folder ?? (s.onlySuperseded ? '(superseded only)' : '(no folder)')}  ${e.videos.length}v ${e.screenshots.length}s ${e.data.length}d  ${s.logExcerpts.length} log ranges`)
  }
  lines.push(`logs: ${scan.logs.length}`, `data-setup: ${scan.dataSetup.videos.length}v ${scan.dataSetup.screenshots.length}s snapshot ${scan.dataSetup.snapshotPath ?? 'none'}`, `hashes: ${Object.keys(scan.hashes).length}`)
  if (scan.diff !== null) {
    const d = scan.diff
    lines.push(d.first ? 'first publish: everything is new' : `changed ${d.changed.length}, added ${d.added.length}, dropped ${d.dropped.length}`)
  }
  return lines.join('\n')
}
