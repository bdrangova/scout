// `scout groups context | set`: the logical groupings of a change for the Blueprint page (review/groups.json), written only here.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import {
  BLUEPRINT_GROUPS_FILE,
  BLUEPRINT_GROUPS_SCHEMA_VERSION,
  BlueprintGroupingTypeSchema,
  BlueprintGroupsInputSchema,
  BlueprintGroupsSchema,
  checkBlueprintGroups,
  isTestRun,
  JournalSchema,
  JOURNAL_FILE,
  liveEntries,
  type BlueprintGroup,
  type BlueprintGroupingType,
  type BlueprintGroups,
  type FileStatus,
} from '@scout/shared'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { manifestExists, readManifest, resolveHome, sessionDir, writeJsonAtomic } from '../store.ts'
import { resolveJournalSession, type JournalSession } from './journal.ts'

export interface GroupsContextFile {
  path: string
  status: FileStatus
  additions: number
  deletions: number
  /** Scout's live one-line journal summary title for the file, when there is one. */
  summary: string | null
}

export interface GroupsContextExisting {
  type: BlueprintGroupingType
  createdAt: string
  groups: string[]
}

export interface GroupsContext {
  sessionId: string
  title: string
  files: GroupsContextFile[]
  existing: GroupsContextExisting[]
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** The session by id or by repo + branch; never created; a development or PR review, not a test run. */
async function resolveSession(options: { home: string; repo: string; id?: string | null }): Promise<JournalSession> {
  if (options.id) {
    const dir = sessionDir(options.home, options.id)
    if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
    const manifest = await readManifest(dir)
    if (isTestRun(manifest)) throw new Error(`session ${options.id} is a test run; groups are for code changes (development and PR reviews)`)
    return { id: options.id, dir, manifest, created: false }
  }
  const session = await resolveJournalSession({ home: options.home, repo: options.repo, id: options.id, create: false })
  if (session === null) throw new Error('no open review session for this branch (publish one with /scout-development-review or /scout-pr-review first, or pass its id)')
  return session
}

async function readGroups(dir: string): Promise<BlueprintGroups | null> {
  const parsed = BlueprintGroupsSchema.safeParse(await readJsonFile(path.join(dir, ...BLUEPRINT_GROUPS_FILE.split('/'))))
  return parsed.success ? parsed.data : null
}

function groupNames(groups: readonly BlueprintGroup[]): string[] {
  return groups.map((group) => group.name)
}

export async function groupsContext(options: { home: string; repo: string; id?: string | null }): Promise<GroupsContext> {
  const session = await resolveSession(options)
  const { tree } = await computeWorkingTree({ repo: session.manifest.repo.path, baseRef: session.manifest.repo.baseRef })
  const journal = JournalSchema.safeParse(await readJsonFile(path.join(session.dir, ...JOURNAL_FILE.split('/'))))
  const summaries = new Map<string, string>()
  if (journal.success) for (const entry of liveEntries(journal.data)) if (entry.kind === 'summary' && entry.file !== null) summaries.set(entry.file, entry.title)
  const existing = await readGroups(session.dir)
  return {
    sessionId: session.id,
    title: session.manifest.title,
    files: tree.files
      .map((file) => ({ path: file.path, status: file.status, additions: file.additions, deletions: file.deletions, summary: summaries.get(file.path) ?? null }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    existing: Object.entries(existing?.groupings ?? {}).flatMap(([type, grouping]) => {
      const parsed = BlueprintGroupingTypeSchema.safeParse(type)
      return parsed.success && grouping !== undefined ? [{ type: parsed.data, createdAt: grouping.createdAt, groups: groupNames(grouping.groups) }] : []
    }),
  }
}

export function formatGroupsContext(context: GroupsContext): string {
  const lines = [`Session ${context.sessionId}: ${context.title}`, '', `## Changed files (${context.files.length})`, '']
  if (context.files.length === 0) lines.push('(none)')
  for (const file of context.files) {
    lines.push(`- ${file.path} | ${file.status} | +${file.additions} -${file.deletions}${file.summary === null ? '' : ` | ${file.summary}`}`)
  }
  lines.push('', '## Existing groupings', '')
  if (context.existing.length === 0) lines.push('(none)')
  for (const item of context.existing) lines.push(`- ${item.type} (${item.createdAt}): ${item.groups.join(', ')}`)
  return lines.join('\n')
}

function countFiles(groups: readonly BlueprintGroup[]): number {
  return groups.reduce((sum, group) => sum + group.files.length + countFiles(group.groups ?? []), 0)
}

export interface GroupsSetResult {
  sessionId: string
  type: BlueprintGroupingType
  groups: number
  files: number
  file: string
}

export async function setGroups(options: { home: string; repo: string; id?: string | null; type: string; from: string; now?: Date }): Promise<GroupsSetResult> {
  const type = BlueprintGroupingTypeSchema.safeParse(options.type)
  if (!type.success) throw new Error(`unknown grouping type "${options.type}": use ${BlueprintGroupingTypeSchema.options.join(' | ')}`)
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(path.resolve(options.from), 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${options.from} as JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const input = BlueprintGroupsInputSchema.safeParse(raw)
  if (!input.success) throw new Error(`${options.from} is not a valid grouping: ${input.error.message}`)
  const session = await resolveSession(options)
  const { tree } = await computeWorkingTree({ repo: session.manifest.repo.path, baseRef: session.manifest.repo.baseRef })
  const { problems, missing } = checkBlueprintGroups(type.data, input.data.groups, tree.files.map((file) => file.path))
  const errors = [...problems, ...(missing.length > 0 ? [`these changed files are in no group (every changed file must be placed): ${missing.join(', ')}`] : [])]
  if (errors.length > 0) throw new Error(`grouping not saved:\n${errors.map((line) => `- ${line}`).join('\n')}`)
  const nowIso = (options.now ?? new Date()).toISOString()
  const previous = await readGroups(session.dir)
  const next = BlueprintGroupsSchema.parse({
    schemaVersion: BLUEPRINT_GROUPS_SCHEMA_VERSION,
    sessionId: session.id,
    updatedAt: nowIso,
    groupings: { ...previous?.groupings, [type.data]: { createdAt: nowIso, groups: input.data.groups } },
  })
  const file = path.join(session.dir, ...BLUEPRINT_GROUPS_FILE.split('/'))
  await writeJsonAtomic(file, next)
  return { sessionId: session.id, type: type.data, groups: input.data.groups.length, files: countFiles(input.data.groups), file }
}

export function registerGroups(program: Command): void {
  const groups = program.command('groups').description('Logical groupings of a change for the Blueprint page')
  groups
    .command('context')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Print what is needed to group the change: changed files, Scout summaries, existing groupings')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--json', 'print JSON')
    .action(async (id: string | undefined, flags: { repo?: string; json?: boolean }) => {
      const context = await groupsContext({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null })
      console.log(flags.json ? JSON.stringify(context) : formatGroupsContext(context))
    })
  groups
    .command('set')
    .argument('<type>', 'feature | layer | priority')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Validate and save one grouping; every changed file must be in a group')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .requiredOption('--from <file>', 'JSON file: { "groups": [ { id, name, purpose, files, groups? } ] }')
    .option('--json', 'print JSON')
    .action(async (type: string, id: string | undefined, flags: { repo?: string; from: string; json?: boolean }) => {
      const result = await setGroups({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null, type, from: flags.from })
      if (flags.json) console.log(JSON.stringify(result))
      else console.log(`${result.type} grouping saved for session ${result.sessionId}: ${result.groups} groups, ${result.files} files`)
    })
}
