// `ai-review install --repo <path>`: skills, the pending-feedback hook, settings merge, Playwright MCP, launcher, config.
import { execFile } from 'node:child_process'
import { access, chmod, constants, lstat, mkdir, readFile, readlink, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from '../config.ts'
import { mainWorktree, topLevel } from '@review-dash/shared/git/repo'
import { gitText } from '@review-dash/shared/git/run'
import { mergeSettings, type HookSpec } from '../settings-merge.ts'
import { resolveHome, writeJsonAtomic } from '../store.ts'

export const PENDING_HOOK = 'ai_review_pending_feedback.sh'
export const PERMISSION = 'Bash(ai-review *)'
/** Change-list key for the MCP step (a user-level setting, not a file in the repo). */
const MCP_RECORD = 'claude mcp (user)'
export const MCP_ADD_ARGS = ['mcp', 'add', '--scope', 'user', 'playwright', '--', 'npx', '@playwright/mcp@latest', '--caps=devtools']

const TEMPLATE_FILES = [
  { from: 'skills/publish-pr-review/SKILL.md', to: '.claude/skills/publish-pr-review/SKILL.md', mode: 0o644 },
  { from: 'skills/publish-pr-review/SKILL.md', to: '.agents/skills/publish-pr-review/SKILL.md', mode: 0o644 },
  { from: 'skills/publish-review/SKILL.md', to: '.claude/skills/publish-review/SKILL.md', mode: 0o644 },
  { from: 'skills/apply-review/SKILL.md', to: '.claude/skills/apply-review/SKILL.md', mode: 0o644 },
  { from: 'skills/address-pr-comments/SKILL.md', to: '.claude/skills/address-pr-comments/SKILL.md', mode: 0o644 },
  { from: 'skills/publish-test-plan/SKILL.md', to: '.claude/skills/publish-test-plan/SKILL.md', mode: 0o644 },
  { from: 'skills/publish-data-setup/SKILL.md', to: '.claude/skills/publish-data-setup/SKILL.md', mode: 0o644 },
  { from: 'skills/publish-test-run/SKILL.md', to: '.claude/skills/publish-test-run/SKILL.md', mode: 0o644 },
  { from: 'skills/apply-test-review/SKILL.md', to: '.claude/skills/apply-test-review/SKILL.md', mode: 0o644 },
  { from: 'skills/run-app/SKILL.md', to: '.claude/skills/run-app/SKILL.md', mode: 0o644 },
  { from: 'skills/run-app/SKILL.md', to: '.agents/skills/run-app/SKILL.md', mode: 0o644 },
  { from: 'skills/snapshot-db/SKILL.md', to: '.claude/skills/snapshot-db/SKILL.md', mode: 0o644 },
  { from: 'skills/snapshot-db/SKILL.md', to: '.agents/skills/snapshot-db/SKILL.md', mode: 0o644 },
  { from: 'skills/reproduce/SKILL.md', to: '.claude/skills/reproduce/SKILL.md', mode: 0o644 },
  { from: 'skills/reproduce/SKILL.md', to: '.agents/skills/reproduce/SKILL.md', mode: 0o644 },
  { from: 'skills/journal/SKILL.md', to: '.claude/skills/journal/SKILL.md', mode: 0o644 },
  { from: 'skills/journal/SKILL.md', to: '.agents/skills/journal/SKILL.md', mode: 0o644 },
  { from: `hooks/${PENDING_HOOK}`, to: `.claude/hooks/${PENDING_HOOK}`, mode: 0o755 },
] as const

export interface InstallOptions {
  home: string
  repo: string
  mirror?: boolean
  /** Write `.claude/settings.json` instead of `.claude/settings.local.json`. */
  shared?: boolean
  /** The `claude` binary for `claude mcp add`; undefined = look it up on PATH, null = never run it. */
  claudeBin?: string | null
  /** Absolute path of the bundled CLI the launcher should exec; default derived from this module's location. */
  cliBundle?: string
  nodeBin?: string
  /** A directory on PATH that gets an `ai-review` symlink to the launcher (skills call the bare name); default `~/.local/bin`, null = none. */
  pathDir?: string | null
}

export type InstallAction = 'created' | 'updated' | 'unchanged' | 'skipped'

export interface InstallChange {
  path: string
  action: InstallAction
  note?: string
}

export interface InstallResult {
  repo: string
  changes: InstallChange[]
  messages: string[]
  changed: boolean
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  )
}

/** `cli/templates` next to the sources, or `dist/templates` next to the bundle. */
export async function templatesDir(): Promise<string> {
  const candidates = [new URL('./templates/', import.meta.url), new URL('../../templates/', import.meta.url)].map((url) => fileURLToPath(url))
  for (const candidate of candidates) {
    if (await exists(path.join(candidate, 'skills', 'publish-review', 'SKILL.md'))) return candidate
  }
  throw new Error(`templates not found next to ${fileURLToPath(import.meta.url)}`)
}

/** `cli/dist/index.js`: this file when running from the bundle, else the sibling build output. */
export function defaultCliBundle(): string {
  const self = fileURLToPath(import.meta.url)
  if (path.basename(self) === 'index.js' && path.basename(path.dirname(self)) === 'dist') return self
  return path.resolve(path.dirname(self), '..', '..', 'dist', 'index.js')
}

export async function findClaudeBin(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const dirs = [...(env.PATH ?? '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
  const names = process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']
  for (const dir of dirs) {
    if (dir === '') continue
    for (const name of names) {
      const candidate = path.join(dir, name)
      const ok = await access(candidate, constants.X_OK).then(
        () => true,
        () => false,
      )
      if (ok) return candidate
    }
  }
  return null
}

async function writeIfChanged(file: string, content: string, mode: number): Promise<InstallAction> {
  await mkdir(path.dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => null)
  if (current === content) {
    const info = await stat(file)
    if (mode & 0o111 && !(info.mode & 0o111)) {
      await chmod(file, mode)
      return 'updated'
    }
    return 'unchanged'
  }
  await writeFile(file, content, { mode })
  await chmod(file, mode)
  return current === null ? 'created' : 'updated'
}

function hookCommand(script: string): string {
  return `"$CLAUDE_PROJECT_DIR/.claude/hooks/${script}"`
}

/** `git check-ignore` prints the path when ignored and exits 1 (without output) when it is not. */
async function isIgnored(repo: string, relPath: string): Promise<boolean> {
  return (await gitText(repo, ['check-ignore', '--', relPath], { okExitCodes: [1] })).trim() !== ''
}

function run(file: string, args: string[], options: { cwd: string; input?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: options.cwd, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(file)} ${args.join(' ')} failed: ${stderr.trim() || error.message}`))
      else resolve({ stdout, stderr })
    })
    child.stdin?.end(options.input ?? '')
  })
}

export async function installIntoRepo(options: InstallOptions): Promise<InstallResult> {
  const repo = await topLevel(options.repo)
  const templates = await templatesDir()
  const changes: InstallChange[] = []
  const messages: string[] = []
  const record = (file: string, action: InstallAction, note?: string): void => {
    changes.push(note === undefined ? { path: file, action } : { path: file, action, note })
  }

  // Skills and hooks.
  for (const file of TEMPLATE_FILES) {
    const content = await readFile(path.join(templates, ...file.from.split('/')), 'utf8')
    record(file.to, await writeIfChanged(path.join(repo, ...file.to.split('/')), content, file.mode))
  }

  // Settings: hooks keyed by script name, plus the Bash(ai-review *) permission.
  const settingsRel = path.posix.join('.claude', options.shared ? 'settings.json' : 'settings.local.json')
  const settingsFile = path.join(repo, ...settingsRel.split('/'))
  const raw = await readFile(settingsFile, 'utf8').catch(() => null)
  let existing: unknown
  if (raw !== null) {
    try {
      existing = JSON.parse(raw)
    } catch (error) {
      throw new Error(`${settingsRel} is not valid JSON; fix it before running install (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  const hooks: HookSpec[] = [{ event: 'UserPromptSubmit', command: hookCommand(PENDING_HOOK), timeout: 5, matchKey: PENDING_HOOK }]
  const merged = mergeSettings(existing, { hooks, allow: [PERMISSION] })
  if (merged.changed) {
    await writeJsonAtomic(settingsFile, merged.settings)
    record(settingsRel, raw === null ? 'created' : 'updated', merged.added.join(', '))
  } else {
    record(settingsRel, 'unchanged')
  }

  // Keep the local settings file out of git when the repo does not ignore it already.
  if (!options.shared && !(await isIgnored(repo, settingsRel))) {
    const gitignore = path.join(repo, '.gitignore')
    const current = await readFile(gitignore, 'utf8').catch(() => null)
    const prefix = current === null || current === '' || current.endsWith('\n') ? '' : '\n'
    await writeFile(gitignore, `${current ?? ''}${prefix}${settingsRel}\n`)
    record('.gitignore', current === null ? 'created' : 'updated', settingsRel)
  }

  // Playwright MCP for evidence capture, registered once for the user (all repos) through the claude CLI.
  // `claude mcp get` answers for any scope and prints nothing we read, so ~/.claude.json is never opened here.
  const claudeBin = options.claudeBin === undefined ? await findClaudeBin() : options.claudeBin
  if (claudeBin === null) {
    record(MCP_RECORD, 'skipped', 'claude binary not found')
    messages.push(`claude binary not found; register the Playwright MCP yourself: claude ${MCP_ADD_ARGS.join(' ')}`)
  } else if (await run(claudeBin, ['mcp', 'get', 'playwright'], { cwd: repo }).then(() => true, () => false)) {
    record(MCP_RECORD, 'unchanged', 'playwright already registered')
  } else {
    try {
      await run(claudeBin, MCP_ADD_ARGS, { cwd: repo })
      record(MCP_RECORD, 'created', 'playwright (user scope)')
    } catch (error) {
      record(MCP_RECORD, 'skipped', error instanceof Error ? error.message : String(error))
      messages.push(`could not register the Playwright MCP: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Launcher with absolute paths (nvm is not on hook or Desktop PATHs) and the port config.
  const launcher = path.join(options.home, 'bin', 'ai-review')
  const launcherContent = [
    '#!/bin/sh',
    '# review-dash launcher: absolute node and CLI paths so hooks and the Desktop app can run ai-review.',
    `exec ${JSON.stringify(options.nodeBin ?? process.execPath)} ${JSON.stringify(options.cliBundle ?? defaultCliBundle())} "$@"`,
    '',
  ].join('\n')
  record(launcher, await writeIfChanged(launcher, launcherContent, 0o755))

  // The skills and the hook say plain `ai-review`, which a Desktop or terminal session only finds on PATH.
  const pathDir = options.pathDir === undefined ? path.join(os.homedir(), '.local', 'bin') : options.pathDir
  if (pathDir !== null && (await stat(pathDir).then((s) => s.isDirectory(), () => false))) {
    const link = path.join(pathDir, 'ai-review')
    const current = await lstat(link).then(() => readlink(link).catch(() => null), () => undefined)
    if (current === launcher) {
      record(link, 'unchanged')
    } else if (current === undefined) {
      await symlink(launcher, link)
      record(link, 'created', `-> ${launcher}`)
    } else {
      record(link, 'skipped', 'something else is already there')
      messages.push(`${link} already exists and is not the review-dash launcher; put ${path.dirname(launcher)} on PATH instead`)
    }
  } else {
    messages.push(`put ${path.dirname(launcher)} on PATH (or symlink ${launcher} into a PATH directory) so sessions can run ai-review`)
  }

  const configFile = path.join(options.home, CONFIG_FILE)
  if (await exists(configFile)) {
    record(configFile, 'unchanged')
  } else {
    await writeJsonAtomic(configFile, DEFAULT_CONFIG)
    record(configFile, 'created')
  }

  // The pending hook keeps its once-per-session markers here.
  await mkdir(path.join((await gitText(repo, ['rev-parse', '--absolute-git-dir'])).trim(), 'ai-review'), { recursive: true })

  if (options.mirror) {
    const sync = path.join(repo, '.claude', 'hooks', 'sync_claude_folders.sh')
    if (await exists(sync)) {
      const input = JSON.stringify({ tool_input: { file_path: path.join(repo, '.claude', 'skills', 'publish-review', 'SKILL.md') } })
      await run(sync, [], { cwd: repo, input })
      messages.push('mirrored .claude/ with sync_claude_folders.sh')
    } else {
      messages.push('--mirror: .claude/hooks/sync_claude_folders.sh not found; nothing mirrored')
    }
  }

  // Linked worktrees get the skills from the main worktree (symlinked .claude/ or per-skill links), and they share its runtime command.
  const main = (await mainWorktree(repo)).split(path.sep).join('/')
  if (main !== repo.split(path.sep).join('/')) messages.push(`${repo} is a linked worktree: install into the main worktree ${main} instead, and link its .claude/ into worktrees`)
  if ((await readConfig(options.home)).repos?.[main]?.runtime === undefined) {
    messages.push(`no runtime command for ${main}: /run-app and /snapshot-db fall back to guessing ports. Set one with: ai-review env --repo ${JSON.stringify(main)} --set-runtime '<command that prints the runtime JSON>'`)
  }

  return { repo, changes, messages, changed: changes.some((c) => c.action === 'created' || c.action === 'updated') }
}

export function formatInstallResult(result: InstallResult): string {
  const lines = result.changes.map((c) => `${c.action.padEnd(9)} ${c.path}${c.note ? ` (${c.note})` : ''}`)
  lines.push(...result.messages)
  lines.push(result.changed ? `${result.changes.filter((c) => c.action === 'created' || c.action === 'updated').length} change(s) in ${result.repo}` : 'no changes')
  return lines.join('\n')
}

interface InstallFlags {
  repo: string
  mirror?: boolean
  shared?: boolean
}

export function registerInstall(program: Command): void {
  program
    .command('install')
    .description('Install review skills, the pending-feedback hook, settings and launcher')
    .requiredOption('--repo <path>', 'path inside the repository')
    .option('--mirror', 'run .claude/hooks/sync_claude_folders.sh afterwards when present')
    .option('--shared', 'write .claude/settings.json instead of .claude/settings.local.json')
    .action(async (flags: InstallFlags) => {
      const result = await installIntoRepo({
        home: resolveHome(),
        repo: path.resolve(flags.repo),
        mirror: flags.mirror === true,
        shared: flags.shared === true,
      })
      console.log(formatInstallResult(result))
    })
}
