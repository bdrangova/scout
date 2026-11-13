import type { Blueprint, BlueprintFile, TreeFile, WorkingTree } from '@scout/shared'
import { classifyFile } from './kind.ts'
import { changedLinesOf, diffMembers } from './members.ts'
import { isAnalyzablePath, parseModule } from './parse.ts'
import type { ParsedModule } from './parse.ts'
import { parseAliasConfig, resolveImport } from './resolve.ts'
import type { AliasConfig } from './resolve.ts'

/** Files are read and parsed this many at a time. */
export const BLUEPRINT_CONCURRENCY = 8
/** A source file larger than this is not analysed. */
const MAX_SOURCE_BYTES = 1024 * 1024
const MAX_CONFIGS = 50

/** What the analysis needs from the store; every reader may throw (the file is then left unanalysed). */
export interface BlueprintSource {
  tree: WorkingTree
  patches: ReadonlyMap<string, string>
  /** The file as it is now (never asked for a deleted file). */
  readNew(file: TreeFile): Promise<string>
  /** The file at the base (never asked for an added file). */
  readBase(file: TreeFile): Promise<string>
  /** `tsconfig.json` / `jsconfig.json` paths of the repo. */
  listConfigs(): Promise<string[]>
  /** A repo file as text, null when it cannot be read. */
  readConfig(relative: string): Promise<string | null>
}

interface Analysis {
  file: TreeFile
  parsed: ParsedModule
  members: BlueprintFile['members']
}

function analyzable(file: TreeFile): boolean {
  if (file.binary || file.omitted || file.collapsed) return false
  if (!isAnalyzablePath(file.path)) return false
  return (file.sizeAfter ?? 0) <= MAX_SOURCE_BYTES && (file.sizeBefore ?? 0) <= MAX_SOURCE_BYTES
}

async function analyse(file: TreeFile, source: BlueprintSource): Promise<Analysis | null> {
  try {
    const [after, before] = await Promise.all([
      file.status === 'deleted' ? Promise.resolve(null) : source.readNew(file),
      file.status === 'added' ? Promise.resolve(null) : source.readBase(file),
    ])
    const parsed = after === null ? { imports: [], extends: [], declarations: [] } : parseModule(file.path, after)
    const baseDeclarations = before === null ? [] : parseModule(file.oldPath ?? file.path, before).declarations
    return { file, parsed, members: diffMembers(parsed.declarations, baseDeclarations, changedLinesOf(source.patches.get(file.path))) }
  } catch {
    return null
  }
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i] as T)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function loadConfigs(source: BlueprintSource): Promise<AliasConfig[]> {
  let listed: string[]
  try {
    listed = (await source.listConfigs()).slice(0, MAX_CONFIGS)
  } catch {
    return []
  }
  const configs = await Promise.all(listed.map((file) => parseAliasConfig(file, source.readConfig).catch(() => null)))
  return configs.filter((config): config is AliasConfig => config !== null)
}

function link(analysis: Analysis, changed: ReadonlySet<string>, configs: readonly AliasConfig[]): Pick<BlueprintFile, 'imports' | 'extends'> {
  const imports = new Set<string>()
  const byBinding = new Map<string, string>()
  for (const ref of analysis.parsed.imports) {
    const target = resolveImport(ref.specifier, analysis.file.path, changed, configs)
    if (target === null || target === analysis.file.path) continue
    imports.add(target)
    for (const binding of ref.bindings) byBinding.set(binding, target)
  }
  const inherited = new Set<string>()
  for (const ref of analysis.parsed.extends) {
    const target = byBinding.get(ref.base)
    if (target !== undefined) inherited.add(target)
  }
  return { imports: [...imports].sort(), extends: [...inherited].sort() }
}

/** The Blueprint of a session tree: one entry per file, in tree order. A file that cannot be read or parsed is left unanalysed. */
export async function computeBlueprint(source: BlueprintSource): Promise<Blueprint> {
  const { tree } = source
  const changed = new Set(tree.files.filter((f) => f.status !== 'deleted').map((f) => f.path))
  const [configs, analyses] = await Promise.all([
    loadConfigs(source),
    mapLimited(tree.files, BLUEPRINT_CONCURRENCY, (file) => (analyzable(file) ? analyse(file, source) : Promise.resolve(null))),
  ])
  const files = tree.files.map((file, i): BlueprintFile => {
    const analysis = analyses[i]
    const kind = classifyFile(file.path)
    if (analysis === null || analysis === undefined) return { path: file.path, kind, analyzed: false, members: [], imports: [], extends: [] }
    return { path: file.path, kind, analyzed: true, members: analysis.members, ...link(analysis, changed, configs) }
  })
  return { fingerprint: tree.fingerprint, files }
}
