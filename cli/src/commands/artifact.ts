// `ai-review artifact add|remove`: put a file into a session's evidence, extras or spec folder and keep that folder's index.json in step.
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { EvidenceIndexSchema, ExtrasIndexSchema, SpecIndexSchema, SpecTypeSchema, type SpecType } from '@scout/shared'
import { resolveHome, writeJsonAtomic } from '../store.ts'
import { PATH_KINDS, sessionPath, type PathKind } from './path.ts'

const INDEX_FILE = 'index.json'
const INDEX_SCHEMAS = { evidence: EvidenceIndexSchema, extras: ExtrasIndexSchema, spec: SpecIndexSchema } as const

/** Index fields each kind accepts (besides `file`). */
const KIND_OPTIONS: Record<PathKind, readonly string[]> = {
  evidence: ['caption', 'description', 'order'],
  extras: ['title', 'order'],
  spec: ['title', 'type', 'url', 'sourcePath', 'capturedAt', 'order'],
}

export interface ArtifactOptions {
  caption?: string
  description?: string
  title?: string
  type?: SpecType
  url?: string
  sourcePath?: string
  order?: number
  capturedAt?: string
}

type IndexEntry = Record<string, unknown> & { file: string }
interface RawIndex extends Record<string, unknown> {
  items: IndexEntry[]
}

export function parseKind(value: string): PathKind {
  const kind = PATH_KINDS.find((k) => k === value)
  if (kind === undefined) throw new Error(`unknown kind "${value}": expected ${PATH_KINDS.join(' | ')}`)
  return kind
}

/** The absolute path of `name` inside `folder`; throws when it would escape it. */
function inside(folder: string, name: string): string {
  const target = path.resolve(folder, name)
  const rel = path.relative(folder, target)
  if (name === '' || rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`"${name}" is not a path inside ${folder}`)
  return target
}

async function readIndex(folder: string, kind: PathKind): Promise<RawIndex> {
  const file = path.join(folder, INDEX_FILE)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { items: [] }
    throw error
  }
  const raw: unknown = JSON.parse(text)
  const parsed = INDEX_SCHEMAS[kind].safeParse(raw)
  if (!parsed.success) throw new Error(`${file} is not a valid ${kind} index: ${parsed.error.message}`)
  return raw as RawIndex
}

async function writeIndex(folder: string, kind: PathKind, index: RawIndex): Promise<void> {
  INDEX_SCHEMAS[kind].parse(index)
  await writeJsonAtomic(path.join(folder, INDEX_FILE), index)
}

function buildEntry(kind: PathKind, file: string, options: ArtifactOptions, extra: Partial<ArtifactOptions>): IndexEntry {
  const merged: ArtifactOptions = { ...extra, ...options }
  const entry: IndexEntry = { file }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue
    if (!KIND_OPTIONS[kind].includes(key)) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is not valid for ${kind} (accepted: ${KIND_OPTIONS[kind].join(', ')})`)
    entry[key] = value
  }
  return entry
}

export async function addArtifact(options: { home: string; id: string; kind: PathKind; source: string; as?: string; fields: ArtifactOptions }): Promise<{ path: string; entry: IndexEntry }> {
  const { home, id, kind, fields } = options
  const folder = await sessionPath({ home, id, kind })
  const source = path.resolve(options.source)
  if (!(await stat(source)).isFile()) throw new Error(`${options.source} is not a file`)
  const name = options.as ?? path.basename(source)
  const destination = inside(folder, name)
  const fromOutside = path.relative(folder, source).startsWith('..')
  const entry = buildEntry(kind, path.relative(folder, destination), fields, kind === 'spec' && fromOutside ? { sourcePath: source } : {})
  const index = await readIndex(folder, kind)
  await mkdir(path.dirname(destination), { recursive: true })
  if (destination !== source) await copyFile(source, destination)
  const existing = index.items.find((item) => item.file === entry.file)
  const merged: IndexEntry = { ...existing, ...entry }
  index.items = existing ? index.items.map((item) => (item === existing ? merged : item)) : [...index.items, merged]
  await writeIndex(folder, kind, index)
  return { path: destination, entry: merged }
}

export async function removeArtifact(options: { home: string; id: string; kind: PathKind; name: string }): Promise<{ path: string; removedEntry: boolean }> {
  const folder = await sessionPath({ home: options.home, id: options.id, kind: options.kind })
  const target = inside(folder, options.name)
  const file = path.relative(folder, target)
  const index = await readIndex(folder, options.kind)
  const items = index.items.filter((item) => item.file !== file)
  await rm(target, { force: true })
  if (items.length !== index.items.length) await writeIndex(folder, options.kind, { ...index, items })
  return { path: target, removedEntry: items.length !== index.items.length }
}

function parseOrder(value: string): number {
  const order = Number(value)
  if (!Number.isInteger(order) || order < 0) throw new Error(`--order must be a non-negative integer, got "${value}"`)
  return order
}

interface AddFlags extends ArtifactOptions {
  as?: string
  json?: boolean
}

export function registerArtifact(program: Command): void {
  const command = program.command('artifact').description("Add or remove files in a session's evidence, extras or spec folder, keeping index.json in step")
  command
    .command('add')
    .argument('<sessionId>', 'session id')
    .argument('<kind>', PATH_KINDS.join(' | '))
    .argument('<file>', 'file to copy in')
    .option('--as <name>', 'name inside the folder (default: the file name)')
    .option('--caption <text>', 'evidence: caption')
    .option('--description <text>', 'evidence: description')
    .option('--title <text>', 'extras, spec: title')
    .option('--type <type>', `spec: ${SpecTypeSchema.options.join(' | ')}`)
    .option('--url <url>', 'spec: where the source lives')
    .option('--source-path <path>', 'spec: where the file came from (default: its absolute path when outside the session)')
    .option('--order <n>', 'evidence, extras, spec: sort position', parseOrder)
    .option('--captured-at <iso>', 'spec: when the snapshot was taken (ISO 8601)')
    .option('--json', 'print {path, entry} as JSON')
    .description('Copy a file into the session folder and add or replace its index.json entry; prints the destination path')
    .action(async (id: string, kindArg: string, file: string, flags: AddFlags) => {
      const { as, json, ...fields } = flags
      if (fields.type !== undefined) fields.type = SpecTypeSchema.parse(fields.type)
      const result = await addArtifact({ home: resolveHome(), id, kind: parseKind(kindArg), source: file, ...(as === undefined ? {} : { as }), fields })
      console.log(json === true ? JSON.stringify(result, null, 2) : result.path)
    })
  command
    .command('remove')
    .argument('<sessionId>', 'session id')
    .argument('<kind>', PATH_KINDS.join(' | '))
    .argument('<name>', 'file name inside the folder')
    .description('Delete a file from the session folder and its index.json entry')
    .action(async (id: string, kindArg: string, name: string) => {
      console.log((await removeArtifact({ home: resolveHome(), id, kind: parseKind(kindArg), name })).path)
    })
}
