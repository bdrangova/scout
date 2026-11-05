// `scout pack add|remove|list`: register the folders of packs (a repository's own skills and setup kept outside
// Scout, see `@scout/shared/packs`). Add and remove are terminal only: a pack's runtime and after-install commands run on
// the user's machine, so an agent must not be able to register one.
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Command } from 'commander'
import { CONFIG_FILE } from '@scout/shared'
import { loadPack, loadRegisteredPacks } from '@scout/shared/packs'
import type { LoadedPack } from '@scout/shared'
import { readConfig } from '../config.ts'
import { resolveHome, writeJsonAtomic } from '../store.ts'

function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

async function readRawConfig(home: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(home, CONFIG_FILE), 'utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function writePacks(home: string, dirs: string[]): Promise<void> {
  const raw = await readRawConfig(home)
  const config = await readConfig(home)
  const next: Record<string, unknown> = { ...raw, port: raw.port ?? config.port }
  if (dirs.length === 0) delete next.packs
  else next.packs = dirs
  await writeJsonAtomic(path.join(home, CONFIG_FILE), next)
}

function requireTerminal(interactive: boolean | undefined, what: string): void {
  if (!(interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true))) {
    throw new Error(`pack ${what} must be run by you in a terminal, not by an agent: a pack's commands run on your machine`)
  }
}

/** Registers a pack folder (absolute); it must hold a valid manifest. Returns the pack as read. */
export async function addPack(options: { home: string; dir: string; interactive?: boolean }): Promise<LoadedPack & { added: boolean }> {
  requireTerminal(options.interactive, 'add')
  const dir = path.resolve(expandHome(options.dir))
  const pack = await loadPack(dir)
  if (pack.error !== null) throw new Error(pack.error)
  const current = (await readConfig(options.home)).packs ?? []
  if (current.includes(dir)) return { ...pack, added: false }
  await writePacks(options.home, [...current, dir])
  return { ...pack, added: true }
}

export async function removePack(options: { home: string; dir: string; interactive?: boolean }): Promise<boolean> {
  requireTerminal(options.interactive, 'remove')
  const dir = path.resolve(expandHome(options.dir))
  const current = (await readConfig(options.home)).packs ?? []
  if (!current.includes(dir)) return false
  await writePacks(
    options.home,
    current.filter((d) => d !== dir),
  )
  return true
}

export function formatPack(pack: LoadedPack): string {
  if (pack.manifest === null) return `${pack.dir}\n  error: ${pack.error}`
  const m = pack.manifest
  const lines = [`${m.name}  ${pack.dir}`, `  repos: ${m.repos.join(', ')}`]
  if (m.description !== undefined) lines.splice(1, 0, `  ${m.description}`)
  const skills = Object.entries(m.skills ?? {}).map(([role, skill]) => `${role}=${skill}`)
  if (skills.length > 0) lines.push(`  skills: ${skills.join(', ')}`)
  if (m.files !== undefined) lines.push(`  files: ${m.files}`)
  if (m.runtime !== undefined) lines.push(`  runtime: ${m.runtime}`)
  if (m.afterInstall !== undefined) lines.push(`  after install: ${m.afterInstall}`)
  return lines.join('\n')
}

export function registerPack(program: Command): void {
  const pack = program.command('pack').description("Register packs: a repository's own skills and setup, kept outside Scout")
  pack
    .command('add <dir>')
    .description('register the pack in <dir> (terminal only); run `scout install` in the repository afterwards')
    .action(async (dir: string) => {
      const result = await addPack({ home: resolveHome(), dir })
      console.log(`${result.added ? 'registered' : 'already registered'}:\n${formatPack(result)}`)
    })
  pack
    .command('remove <dir>')
    .description('unregister the pack in <dir> (terminal only); files it installed stay in the repository')
    .action(async (dir: string) => {
      console.log((await removePack({ home: resolveHome(), dir })) ? `unregistered ${dir}` : `${dir} was not registered`)
    })
  pack
    .command('list')
    .description('list registered packs')
    .option('--json', 'print JSON')
    .action(async (flags: { json?: boolean }) => {
      const packs = await loadRegisteredPacks(resolveHome())
      if (flags.json === true) console.log(JSON.stringify(packs, null, 2))
      else console.log(packs.length === 0 ? 'no packs registered' : packs.map(formatPack).join('\n\n'))
    })
}
