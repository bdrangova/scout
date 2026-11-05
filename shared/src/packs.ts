// Node-only: reads registered packs from disk. The CLI (install, env, pack) and the server (help panel) share it.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_FILE } from './constants.ts'
import { PACK_MANIFEST_FILE, PackManifestSchema, type LoadedPack, type PackManifest, type PackSkillRole } from './schemas/packs.ts'

/** The `packs` key of `<home>/config.json`: absolute pack folders in the order registered. Missing or malformed reads as none. */
export async function registeredPackDirs(home: string): Promise<string[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(home, CONFIG_FILE), 'utf8'))
    const packs = raw !== null && typeof raw === 'object' ? (raw as { packs?: unknown }).packs : undefined
    return Array.isArray(packs) ? packs.filter((p): p is string => typeof p === 'string' && p !== '') : []
  } catch {
    return []
  }
}

export async function loadPack(dir: string): Promise<LoadedPack> {
  let json: unknown
  try {
    json = JSON.parse(await readFile(path.join(dir, PACK_MANIFEST_FILE), 'utf8'))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { dir, manifest: null, error: code === 'ENOENT' ? `no ${PACK_MANIFEST_FILE} in ${dir}` : `${PACK_MANIFEST_FILE} is not valid JSON` }
  }
  const parsed = PackManifestSchema.safeParse(json)
  if (!parsed.success) return { dir, manifest: null, error: `${PACK_MANIFEST_FILE}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` }
  if (parsed.data.files !== undefined) {
    const files = path.resolve(dir, parsed.data.files)
    if (files !== dir && !files.startsWith(dir + path.sep)) return { dir, manifest: null, error: `${PACK_MANIFEST_FILE}: files must stay inside the pack` }
  }
  return { dir, manifest: parsed.data, error: null }
}

export async function loadRegisteredPacks(home: string): Promise<LoadedPack[]> {
  return Promise.all((await registeredPackDirs(home)).map((dir) => loadPack(dir)))
}

export interface MatchedPack {
  dir: string
  manifest: PackManifest
}

/** Repository name of origin (`git@host:org/name.git` -> `name`), or null without an origin. */
export function originRepoName(url: string | null): string | null {
  if (url === null) return null
  const name = path.posix.basename(url.trim().replace(/\/+$/, '').replace(/^.*:/, '/'), '.git')
  return name === '' || name === '.' || name === '..' ? null : name
}

/** The readable packs that apply to a repository with this origin name, in registration order. */
export function packsForRepo(packs: readonly LoadedPack[], originName: string | null): MatchedPack[] {
  if (originName === null) return []
  const name = originName.toLowerCase()
  return packs.flatMap((p) => (p.manifest !== null && p.manifest.repos.some((r) => r.toLowerCase() === name) ? [{ dir: p.dir, manifest: p.manifest }] : []))
}

/** Skill name per job; the first registered pack that names a job wins. */
export function packSkills(packs: readonly MatchedPack[]): Partial<Record<PackSkillRole, string>> {
  const skills: Partial<Record<PackSkillRole, string>> = {}
  for (const pack of packs) {
    for (const [role, skill] of Object.entries(pack.manifest.skills ?? {}) as [PackSkillRole, string][]) skills[role] ??= skill
  }
  return skills
}
