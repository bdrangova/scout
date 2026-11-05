// `scout journal add | list | supersede`: Scout's journal (review/journal.json), written only here.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import {
  JOURNAL_FILE,
  JOURNAL_ID_RE,
  JournalAlternativeSchema,
  JournalEntrySchema,
  JournalKindSchema,
  JournalSchema,
  isTestRun,
  liveEntries,
  nextJournalId,
  type CodeReviewManifest,
  type Journal,
  type JournalAlternative,
  type JournalAnchor,
  type JournalEntry,
} from '@scout/shared'
import { resolveBase } from '@scout/shared/git/base'
import { currentBranch, showFile, topLevel } from '@scout/shared/git/repo'
import { openSessionForBranch } from '../sessions.ts'
import { manifestExists, readManifest, resolveHome, sessionDir, writeJsonAtomic } from '../store.ts'
import { initSession } from './init.ts'

export const JournalInputSchema = z.object({
  kind: JournalKindSchema,
  title: z.string().min(1).max(120),
  body: z.string().optional(),
  file: z.string().min(1).optional(),
  /** `12` or `12-14`. */
  line: z.union([z.number().int().min(1), z.string()]).optional(),
  side: z.enum(['new', 'old']).optional(),
  /** `"option::why not"` strings or objects. */
  alt: z.array(z.union([z.string(), JournalAlternativeSchema])).optional(),
  related: z.union([z.string(), z.array(z.string().min(1))]).optional(),
  supersedes: z.string().regex(JOURNAL_ID_RE).optional(),
})
export type JournalInput = z.infer<typeof JournalInputSchema>
const JournalFromSchema = z.array(JournalInputSchema).min(1)

/** The `--from` file: a JSON array of entries with the flag fields. */
export async function readJournalInputs(file: string): Promise<JournalInput[]> {
  return JournalFromSchema.parse(JSON.parse(await readFile(path.resolve(file), 'utf8')))
}

export function parseAlternative(spec: string | JournalAlternative): JournalAlternative {
  if (typeof spec !== 'string') return spec
  const at = spec.indexOf('::')
  const option = (at === -1 ? '' : spec.slice(0, at)).trim()
  const whyNot = (at === -1 ? '' : spec.slice(at + 2)).trim()
  if (option === '' || whyNot === '') throw new Error(`invalid --alt "${spec}": expected "option::why not"`)
  return { option, whyNot }
}

export function parseLineRange(spec: string | number): { line: number; endLine?: number } {
  const match = /^(\d+)(?:-(\d+))?$/.exec(String(spec).trim())
  const line = match?.[1] === undefined ? 0 : Number(match[1])
  const end = match?.[2] === undefined ? undefined : Number(match[2])
  if (line < 1 || (end !== undefined && end < line)) throw new Error(`invalid --line "${spec}": expected <n> or <n>-<m>`)
  return end === undefined || end === line ? { line } : { line, endLine: end }
}

async function readJournal(dir: string, id: string): Promise<Journal | null> {
  let raw: string
  try {
    raw = await readFile(path.join(dir, ...JOURNAL_FILE.split('/')), 'utf8')
  } catch {
    return null
  }
  const parsed = JournalSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`${JOURNAL_FILE} of session ${id} is invalid: ${parsed.error.message}`)
  return parsed.data
}

async function writeJournal(dir: string, journal: Journal): Promise<Journal> {
  const valid = JournalSchema.parse(journal)
  await writeJsonAtomic(path.join(dir, ...JOURNAL_FILE.split('/')), valid)
  return valid
}

export interface JournalSession {
  id: string
  dir: string
  manifest: CodeReviewManifest
  created: boolean
}

async function sessionById(home: string, id: string): Promise<JournalSession> {
  const dir = sessionDir(home, id)
  if (!(await manifestExists(dir))) throw new Error(`session ${id} not found under ${home} (no manifest.json)`)
  const manifest = await readManifest(dir)
  if (isTestRun(manifest) || manifest.kind === 'pr-review') throw new Error(`session ${id} is not a code-review session; the journal is for code reviews only`)
  return { id, dir, manifest, created: false }
}

/** An explicit id, else the live session for repo + branch; with `create`, a missing one is created like `scout init` (title = branch). */
export async function resolveJournalSession(options: { home: string; repo: string; id?: string | null; create: boolean }): Promise<JournalSession | null> {
  if (options.id) return sessionById(options.home, options.id)
  const repo = await topLevel(options.repo)
  const open = await openSessionForBranch(options.home, repo, await currentBranch(repo))
  if (open !== null) return { id: open.id, dir: open.dir, manifest: open.manifest, created: false }
  if (!options.create) return null
  const created = await initSession({ home: options.home, repo })
  return { id: created.id, dir: created.dir, manifest: created.manifest, created: true }
}

function linesOf(text: string): string[] {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** The anchor for `file:line`, with the trimmed first line as snippet; `new` reads the working tree, `old` the merge base. */
async function buildAnchor(session: JournalSession, file: string, input: JournalInput): Promise<JournalAnchor> {
  const side = input.side ?? 'new'
  const range = parseLineRange(input.line ?? 0)
  const repo = session.manifest.repo.path
  let text: string
  try {
    if (side === 'new') {
      text = await readFile(path.join(repo, file), 'utf8')
    } else {
      const base = await resolveBase({ repo, baseRef: session.manifest.repo.baseRef })
      text = (await showFile(repo, base.sha, file, base.env === null ? {} : { env: base.env })).toString('utf8')
    }
  } catch {
    throw new Error(`cannot read ${file} on the ${side} side to anchor the note`)
  }
  const lines = linesOf(text)
  if (range.line > lines.length || (range.endLine ?? range.line) > lines.length) {
    throw new Error(`line ${range.endLine ?? range.line} is out of range: ${file} has ${lines.length} lines (${side} side)`)
  }
  const snippet = (lines[range.line - 1] ?? '').trim().slice(0, 300)
  if (snippet === '') throw new Error(`${file}:${range.line} is blank; anchor a line with code`)
  return { side, ...range, snippet }
}

function supersede(entries: JournalEntry[], oldId: string, newId: string, now: string): void {
  const old = entries.find((entry) => entry.id === oldId)
  if (old === undefined) throw new Error(`unknown journal entry ${oldId}`)
  if (old.supersededBy !== undefined) throw new Error(`${oldId} is already superseded by ${old.supersededBy}`)
  old.supersededBy = newId
  old.updatedAt = now
}

export interface JournalAddOptions {
  home: string
  repo: string
  id?: string | null
  inputs: JournalInput[]
  now?: Date
}

export interface JournalAddResult {
  sessionId: string
  created: boolean
  ids: string[]
  entries: JournalEntry[]
  file: string
}

export async function addJournalEntries(options: JournalAddOptions): Promise<JournalAddResult> {
  const nowIso = (options.now ?? new Date()).toISOString()
  // Validate the cheap parts before a session gets created.
  for (const input of options.inputs) {
    if (input.line !== undefined && input.file === undefined) throw new Error('--line needs --file')
    if (input.kind === 'summary' && (input.file === undefined || input.line !== undefined)) throw new Error('a summary needs --file and has no --line')
  }
  const session = await resolveJournalSession({ home: options.home, repo: options.repo, id: options.id, create: true })
  if (session === null) throw new Error('no review session')
  const existing = await readJournal(session.dir, session.id)
  const entries = (existing?.entries ?? []).map((entry) => ({ ...entry }))
  let nextId = existing?.nextId ?? 1
  const added: JournalEntry[] = []
  for (const input of options.inputs) {
    const id = nextJournalId({ nextId } as Journal)
    nextId += 1
    const file = input.file === undefined ? null : input.file.split(path.sep).join('/')
    const alternatives = input.alt?.map(parseAlternative)
    const related = (typeof input.related === 'string' ? input.related.split(',') : (input.related ?? [])).map((p) => p.trim()).filter((p) => p !== '')
    const anchor = file !== null && input.line !== undefined ? await buildAnchor(session, file, input) : undefined
    const entry = JournalEntrySchema.parse({
      id,
      kind: input.kind,
      title: input.title,
      body: input.body ?? '',
      file,
      ...(anchor !== undefined && { anchor }),
      ...(alternatives !== undefined && alternatives.length > 0 && { alternatives }),
      ...(related.length > 0 && { related }),
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    if (input.supersedes !== undefined) supersede(entries, input.supersedes, id, nowIso)
    if (entry.kind === 'summary') {
      const previous = entries.find((e) => e.kind === 'summary' && e.file === entry.file && e.supersededBy === undefined)
      if (previous !== undefined) supersede(entries, previous.id, id, nowIso)
    }
    entries.push(entry)
    added.push(entry)
  }
  const journal = await writeJournal(session.dir, { schemaVersion: 2, sessionId: session.id, updatedAt: nowIso, nextId, entries })
  const byId = new Map(journal.entries.map((entry) => [entry.id, entry]))
  return {
    sessionId: session.id,
    created: session.created,
    ids: added.map((entry) => entry.id),
    entries: added.map((entry) => byId.get(entry.id) ?? entry),
    file: path.join(session.dir, ...JOURNAL_FILE.split('/')),
  }
}

export async function supersedeJournalEntry(options: { home: string; id: string; old: string; by: string; now?: Date }): Promise<Journal> {
  const session = await sessionById(options.home, options.id)
  const journal = await readJournal(session.dir, session.id)
  if (journal === null) throw new Error(`session ${options.id} has no journal`)
  if (options.old === options.by) throw new Error('an entry cannot supersede itself')
  if (!journal.entries.some((entry) => entry.id === options.by)) throw new Error(`unknown journal entry ${options.by}`)
  const nowIso = (options.now ?? new Date()).toISOString()
  const entries = journal.entries.map((entry) => ({ ...entry }))
  supersede(entries, options.old, options.by, nowIso)
  return writeJournal(session.dir, { ...journal, updatedAt: nowIso, entries })
}

export interface JournalListResult {
  sessionId: string | null
  entries: JournalEntry[]
}

export async function listJournal(options: { home: string; repo: string; id?: string | null; file?: string | null }): Promise<JournalListResult> {
  const session = await resolveJournalSession({ home: options.home, repo: options.repo, id: options.id, create: false })
  if (session === null) return { sessionId: null, entries: [] }
  const journal = await readJournal(session.dir, session.id)
  const entries = (journal?.entries ?? []).filter((entry) => options.file === undefined || options.file === null || entry.file === options.file)
  return { sessionId: session.id, entries }
}

function where(entry: JournalEntry): string {
  if (entry.file === null) return 'session'
  if (entry.anchor === undefined) return entry.file
  const end = entry.anchor.endLine === undefined ? '' : `-${entry.anchor.endLine}`
  return `${entry.file}:${entry.anchor.line}${end}${entry.anchor.side === 'old' ? ' (old)' : ''}`
}

export function formatJournalEntry(entry: JournalEntry): string {
  const state = entry.supersededBy === undefined ? '' : ` (superseded by ${entry.supersededBy})`
  return `${entry.id} [${entry.kind}] ${entry.title} · ${where(entry)}${state}`
}

interface AddFlags {
  repo?: string
  kind?: string
  title?: string
  body?: string
  bodyFile?: string
  file?: string
  line?: string
  side?: string
  alt?: string[]
  related?: string
  supersedes?: string
  from?: string
  json?: boolean
}

async function inputsFromFlags(flags: AddFlags): Promise<JournalInput[]> {
  if (flags.from) return readJournalInputs(flags.from)
  if (!flags.kind || !flags.title) throw new Error('journal add needs --kind and --title (or --from <file>)')
  if (flags.body !== undefined && flags.bodyFile !== undefined) throw new Error('use --body or --body-file, not both')
  const body = flags.bodyFile === undefined ? flags.body : await readFile(path.resolve(flags.bodyFile), 'utf8')
  return [
    JournalInputSchema.parse({
      kind: flags.kind,
      title: flags.title,
      ...(body !== undefined && { body }),
      ...(flags.file !== undefined && { file: flags.file }),
      ...(flags.line !== undefined && { line: flags.line }),
      ...(flags.side !== undefined && { side: flags.side }),
      ...(flags.alt !== undefined && { alt: flags.alt }),
      ...(flags.related !== undefined && { related: flags.related }),
      ...(flags.supersedes !== undefined && { supersedes: flags.supersedes }),
    }),
  ]
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value]

export function registerJournal(program: Command): void {
  const journal = program.command('journal').description("Scout's journal: decisions and implementation notes for the reviewer")
  journal
    .command('add')
    .argument('[id]', 'session id (default: the open session for this branch, created when missing)')
    .description('Add one entry (flags) or many (--from)')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--kind <kind>', 'summary | decision | implementation | tradeoff | caveat')
    .option('--title <text>', 'one line, at most 120 characters')
    .option('--body <md>', 'markdown body')
    .option('--body-file <path>', 'read the body from a file')
    .option('--file <path>', 'repo path the note is about (omit for a session-level note)')
    .option('--line <n[-m]>', 'anchor to a line or range of --file (needs --file)')
    .option('--side <side>', 'new (working tree, default) | old (merge base)')
    .option('--alt <option::why not>', 'a rejected alternative (repeatable)', collect)
    .option('--related <paths>', 'comma-separated other repo paths this touches')
    .option('--supersedes <jN>', 'the entry this one replaces')
    .option('--from <file>', 'JSON array of entries with the same fields (kind, title, body, file, line, side, alt, related, supersedes)')
    .option('--json', 'print JSON')
    .action(async (id: string | undefined, flags: AddFlags) => {
      const result = await addJournalEntries({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null, inputs: await inputsFromFlags(flags) })
      if (flags.json) console.log(JSON.stringify({ sessionId: result.sessionId, created: result.created, ids: result.ids, entries: result.entries }))
      else for (const entry of result.entries) console.log(formatJournalEntry(entry))
    })
  journal
    .command('list')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('List entries')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--file <path>', 'only this file')
    .option('--json', 'print JSON')
    .action(async (id: string | undefined, flags: { repo?: string; file?: string; json?: boolean }) => {
      const result = await listJournal({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null, file: flags.file ?? null })
      if (flags.json) console.log(JSON.stringify(result))
      else if (result.sessionId === null) console.log('no open review session for this branch')
      else if (result.entries.length === 0) console.log(`session ${result.sessionId}: no journal entries`)
      else for (const entry of result.entries) console.log(formatJournalEntry(entry))
    })
  journal
    .command('supersede')
    .argument('<id>', 'session id')
    .argument('<jN>', 'the entry that is replaced')
    .requiredOption('--by <jM>', 'the entry that replaces it')
    .description('Mark an entry as replaced by another')
    .action(async (id: string, old: string, flags: { by: string }) => {
      const result = await supersedeJournalEntry({ home: resolveHome(), id, old, by: flags.by })
      console.log(`${old} superseded by ${flags.by} (${liveEntries(result).length} live entries)`)
    })
}
