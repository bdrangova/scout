import { BLUEPRINT_GROUP_MAX_DEPTH, BLUEPRINT_PRIORITY_GROUPS, type BlueprintGroup, type BlueprintGrouping, type BlueprintGroupingType } from '../schemas/blueprint-groups.ts'
import type { BlueprintPackage } from './tree.ts'

/**
 * A grouping is drawn with the same machinery as folders: it becomes a package tree whose "folders" are made-up paths
 * under `@<type>` (`@feature`, `@feature/top-bar`, `@feature/top-bar/tabs`). A real repo folder never starts with `@<type>`
 * followed by nothing or a slash in practice, so diagram ids (`pkg:@feature/top-bar`) and box keys never collide with folders'.
 */
export const BLUEPRINT_VIEW_TITLES: Record<BlueprintGroupingType, string> = { feature: 'By feature', layer: 'By layer', priority: 'By review priority' }

/** The id of the Ungrouped package's last segment (never a valid group id: it starts with `~`). */
export const BLUEPRINT_UNGROUPED_ID = '~ungrouped'

export function blueprintGroupRootDir(type: BlueprintGroupingType): string {
  return `@${type}`
}

/** Which grouping a package folder (or diagram dir) belongs to; null for a real folder. */
export function blueprintGroupingOfDir(dir: string): BlueprintGroupingType | null {
  for (const type of ['feature', 'layer', 'priority'] as const) if (dir === `@${type}` || dir.startsWith(`@${type}/`)) return type
  return null
}

export interface BlueprintGroupTree {
  root: BlueprintPackage
  /** Changed files no group names: they sit in the Ungrouped package. */
  ungrouped: string[]
  /** Files the grouping names that are no longer part of the change (dropped from the tree). */
  gone: string[]
  /** The change moved on since the grouping was made: something is ungrouped or gone. */
  stale: boolean
}

/**
 * The package tree of a grouping over the files changed NOW (`paths`): groups in the agent's order, files inside a group
 * sorted, files that left the change dropped, empty groups dropped, and one last "Ungrouped" package for files no group names.
 * A file named twice counts in the first group that names it.
 */
export function buildBlueprintGroupTree(type: BlueprintGroupingType, grouping: BlueprintGrouping, paths: readonly string[]): BlueprintGroupTree {
  const changed = new Set(paths)
  const placed = new Set<string>()
  const gone: string[] = []

  function build(group: BlueprintGroup, parentDir: string): BlueprintPackage | null {
    const dir = `${parentDir}/${group.id}`
    const files: string[] = []
    for (const file of group.files) {
      if (placed.has(file)) continue
      if (!changed.has(file)) {
        gone.push(file)
        continue
      }
      placed.add(file)
      files.push(file)
    }
    files.sort()
    const packages = (group.groups ?? []).map((child) => build(child, dir)).filter((child): child is BlueprintPackage => child !== null)
    const allFiles = [...files, ...packages.flatMap((child) => child.allFiles)].sort()
    if (allFiles.length === 0) return null
    return { dir, name: group.name, purpose: group.purpose, packages, files, allFiles }
  }

  const rootDir = blueprintGroupRootDir(type)
  const packages = grouping.groups.map((group) => build(group, rootDir)).filter((child): child is BlueprintPackage => child !== null)
  const ungrouped = [...changed].filter((file) => !placed.has(file)).sort()
  if (ungrouped.length > 0) {
    packages.push({ dir: `${rootDir}/${BLUEPRINT_UNGROUPED_ID}`, name: 'Ungrouped', purpose: 'Changed after the grouping was made.', packages: [], files: ungrouped, allFiles: ungrouped })
  }
  const allFiles = [...changed].sort()
  return {
    root: { dir: rootDir, name: BLUEPRINT_VIEW_TITLES[type], packages, files: [], allFiles },
    ungrouped,
    gone: [...new Set(gone)].sort(),
    stale: ungrouped.length > 0 || gone.length > 0,
  }
}

/**
 * What is wrong with groups the agent wants to save, as plain sentences (empty = fine): ids unique among siblings, no file
 * twice, only files of the change (`paths`), nesting within the limit, and for `priority` only the fixed top-level groups.
 * Files of the change that no group names are NOT an error here; the caller reports them (`missing`).
 */
export function checkBlueprintGroups(type: BlueprintGroupingType, groups: readonly BlueprintGroup[], paths: readonly string[]): { problems: string[]; missing: string[] } {
  const changed = new Set(paths)
  const seen = new Map<string, string>()
  const problems: string[] = []

  function walk(list: readonly BlueprintGroup[], trail: string, depth: number) {
    const ids = new Set<string>()
    for (const group of list) {
      const where = trail === '' ? group.id : `${trail}/${group.id}`
      if (ids.has(group.id)) problems.push(`group id "${where}" is used twice among its siblings`)
      ids.add(group.id)
      if (depth > BLUEPRINT_GROUP_MAX_DEPTH) problems.push(`group "${where}" is nested deeper than ${BLUEPRINT_GROUP_MAX_DEPTH} levels`)
      for (const file of group.files) {
        if (!changed.has(file)) problems.push(`"${file}" (in ${where}) is not a changed file of this session`)
        const before = seen.get(file)
        if (before !== undefined) problems.push(`"${file}" is in both ${before} and ${where}`)
        else seen.set(file, where)
      }
      walk(group.groups ?? [], where, depth + 1)
    }
  }
  walk(groups, '', 1)

  if (type === 'priority') {
    const fixed: readonly { id: string; name: string }[] = BLUEPRINT_PRIORITY_GROUPS
    for (const group of groups) {
      const match = fixed.find((item) => item.id === group.id)
      if (!match) problems.push(`priority grouping: top-level group "${group.id}" must be one of ${fixed.map((item) => item.id).join(', ')}`)
      else if (match.name !== group.name) problems.push(`priority grouping: group "${group.id}" must be named "${match.name}"`)
    }
  }
  return { problems, missing: paths.filter((file) => !seen.has(file)) }
}
