import path from 'node:path'
import ts from 'typescript'

/** The module-resolution part of one `tsconfig.json` / `jsconfig.json`: where its aliases point, as repo paths. */
export interface AliasConfig {
  /** Repo folder the config lives in ('' = repo root). It governs the files below it. */
  dir: string
  /** `compilerOptions.baseUrl` as a repo folder, null when unset. */
  baseUrl: string | null
  /** `compilerOptions.paths`, targets already joined with the folder they are relative to. */
  paths: { pattern: string; targets: string[] }[]
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const JS_TO_TS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx', '.jsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

/** Joins and normalises a repo-relative path; null when it climbs out of the repo. */
function repoJoin(...parts: string[]): string | null {
  const joined = path.posix.normalize(path.posix.join(...parts))
  if (joined === '..' || joined.startsWith('../') || path.posix.isAbsolute(joined)) return null
  return joined === '.' ? '' : joined
}

interface RawOptions {
  baseUrl?: unknown
  paths?: unknown
}

function optionsOf(text: string): { options: RawOptions; extendsPath: string | null } | null {
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', text)
  const root: unknown = parsed.config
  if (parsed.error !== undefined || typeof root !== 'object' || root === null) return null
  const record = root as Record<string, unknown>
  const options = typeof record.compilerOptions === 'object' && record.compilerOptions !== null ? (record.compilerOptions as RawOptions) : {}
  return { options, extendsPath: typeof record.extends === 'string' ? record.extends : null }
}

interface Resolved {
  baseUrl: string | null
  /** Pattern -> target list as written, and the folder those targets are relative to. */
  paths: { map: Record<string, string[]>; base: string } | null
}

function pathsOf(options: RawOptions, dir: string): Resolved['paths'] {
  const raw = options.paths
  if (typeof raw !== 'object' || raw === null) return null
  const map: Record<string, string[]> = {}
  for (const [pattern, targets] of Object.entries(raw)) {
    if (Array.isArray(targets)) map[pattern] = targets.filter((t): t is string => typeof t === 'string')
  }
  const baseUrl = typeof options.baseUrl === 'string' ? repoJoin(dir, options.baseUrl) : null
  return { map, base: baseUrl ?? dir }
}

/**
 * The alias settings of one config file. Follows a relative `extends` one level (the parent's
 * `baseUrl` / `paths` apply unless this file sets its own); anything else is ignored.
 */
export async function parseAliasConfig(configPath: string, read: (relative: string) => Promise<string | null>): Promise<AliasConfig | null> {
  const text = await read(configPath)
  if (text === null) return null
  const own = optionsOf(text)
  if (own === null) return null
  const dir = path.posix.dirname(configPath) === '.' ? '' : path.posix.dirname(configPath)

  let baseUrl = typeof own.options.baseUrl === 'string' ? repoJoin(dir, own.options.baseUrl) : null
  let paths = pathsOf(own.options, dir)
  if (own.extendsPath !== null && own.extendsPath.startsWith('.') && (baseUrl === null || paths === null)) {
    const withExt = own.extendsPath.endsWith('.json') ? own.extendsPath : `${own.extendsPath}.json`
    const parentPath = repoJoin(dir, withExt)
    const parentText = parentPath === null ? null : await read(parentPath)
    const parent = parentText === null ? null : optionsOf(parentText)
    if (parentPath !== null && parent !== null) {
      const parentDir = path.posix.dirname(parentPath) === '.' ? '' : path.posix.dirname(parentPath)
      if (baseUrl === null && typeof parent.options.baseUrl === 'string') baseUrl = repoJoin(parentDir, parent.options.baseUrl)
      if (paths === null) paths = pathsOf(parent.options, parentDir)
    }
  }
  if (baseUrl === null && paths === null) return null

  const result: AliasConfig['paths'] = []
  if (paths !== null) {
    for (const [pattern, targets] of Object.entries(paths.map)) {
      const joined = targets.map((target) => repoJoin(paths.base, target)).filter((target): target is string => target !== null)
      result.push({ pattern, targets: joined })
    }
  }
  return { dir, baseUrl, paths: result }
}

/** Every repo path a module path could mean, most specific first. */
function candidates(base: string): string[] {
  const out = [base, ...EXTENSIONS.map((ext) => base + ext)]
  const ext = path.posix.extname(base)
  const swaps = JS_TO_TS[ext]
  if (swaps) {
    const stem = base.slice(0, -ext.length)
    for (const swap of swaps) out.push(stem + swap)
  }
  const dir = base === '' ? '' : `${base}/`
  for (const e of EXTENSIONS) out.push(`${dir}index${e}`)
  return out
}

function firstChanged(base: string | null, changed: ReadonlySet<string>): string | null {
  if (base === null) return null
  return candidates(base).find((candidate) => candidate !== '' && changed.has(candidate)) ?? null
}

function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf('*')
  if (star === -1) return pattern === specifier ? '' : null
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (specifier.length < prefix.length + suffix.length || !specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null
  return specifier.slice(prefix.length, specifier.length - suffix.length)
}

function viaConfig(config: AliasConfig, specifier: string, changed: ReadonlySet<string>): string | null {
  const matches = config.paths
    .map((entry) => ({ entry, captured: matchPattern(entry.pattern, specifier) }))
    .filter((m): m is { entry: AliasConfig['paths'][number]; captured: string } => m.captured !== null)
    .sort((a, b) => b.entry.pattern.indexOf('*') - a.entry.pattern.indexOf('*'))
  for (const { entry, captured } of matches) {
    for (const target of entry.targets) {
      const hit = firstChanged(repoJoin(target.replace('*', () => captured)), changed)
      if (hit !== null) return hit
    }
  }
  if (config.baseUrl !== null) return firstChanged(repoJoin(config.baseUrl, specifier), changed)
  return null
}

function isRelative(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')
}

/** Configs that govern `from`: the nearest first, then the others as a fallback. */
function configsFor(from: string, configs: readonly AliasConfig[]): AliasConfig[] {
  const own = configs.filter((c) => c.dir === '' || from.startsWith(`${c.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)
  return [...own, ...configs.filter((c) => !own.includes(c))]
}

/**
 * The changed file a specifier of `from` points at, or null (a package, a file outside the change, an escape out of the repo).
 * Works on the set of changed paths alone: the specifier never reaches the disk.
 */
export function resolveImport(specifier: string, from: string, changed: ReadonlySet<string>, configs: readonly AliasConfig[]): string | null {
  if (specifier.length === 0 || specifier.includes('\0')) return null
  const clean = specifier.replace(/[?#].*$/, '')
  if (isRelative(clean)) return firstChanged(repoJoin(path.posix.dirname(from), clean), changed)
  for (const config of configsFor(from, configs)) {
    const hit = viaConfig(config, clean, changed)
    if (hit !== null) return hit
  }
  return null
}
