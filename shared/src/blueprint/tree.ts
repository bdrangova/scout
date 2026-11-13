/** A folder of the changed paths, after merging, dissolving and flattening (see `docs/blueprint.md`). */
export interface BlueprintPackage {
  /** The real folder path; '' for the root. */
  dir: string
  /** Relative to the parent package (`a/b` for a merged chain); '' for the root. */
  name: string
  /** A group's one-line purpose (agent groupings only; folders have none). */
  purpose?: string
  packages: BlueprintPackage[]
  /** Files directly in this package, sorted. */
  files: string[]
  /** Every file under this package, sorted. */
  allFiles: string[]
}

/** A package holding this many files in total or fewer dissolves into its parent. */
export const BLUEPRINT_DISSOLVE_MAX_FILES = 2
/** A package holding this many files in total or fewer is flat: every file direct, no sub-packages. */
export const BLUEPRINT_FLAT_MAX_FILES = 14

interface RawNode {
  dir: string
  name: string
  dirs: Map<string, RawNode>
  files: string[]
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function rawNode(dir: string, name: string): RawNode {
  return { dir, name, dirs: new Map(), files: [] }
}

function finish(node: RawNode, isRoot: boolean): BlueprintPackage {
  const files = [...node.files]
  const packages: BlueprintPackage[] = []
  for (const child of [...node.dirs.values()].map((n) => finish(n, false))) {
    if (child.allFiles.length <= BLUEPRINT_DISSOLVE_MAX_FILES) files.push(...child.allFiles)
    else packages.push(child)
  }
  const allFiles = [...files, ...packages.flatMap((p) => p.allFiles)].sort(byText)
  if (allFiles.length <= BLUEPRINT_FLAT_MAX_FILES) return { dir: node.dir, name: node.name, packages: [], files: allFiles, allFiles }
  files.sort(byText)
  packages.sort((a, b) => byText(a.name, b.name) || byText(a.dir, b.dir))
  const only = packages[0]
  // One sub-package and at most a couple of loose files: a level with a single box says nothing, so step through it.
  if (packages.length === 1 && only && files.length <= BLUEPRINT_DISSOLVE_MAX_FILES) {
    return {
      dir: isRoot ? '' : only.dir,
      name: isRoot ? '' : `${node.name}/${only.name}`,
      packages: only.packages,
      files: [...files, ...only.files].sort(byText),
      allFiles,
    }
  }
  return { dir: node.dir, name: node.name, packages, files, allFiles }
}

/** The package tree of the changed paths; the root has `dir` ''. */
export function buildBlueprintTree(paths: string[]): BlueprintPackage {
  const root = rawNode('', '')
  for (const path of new Set(paths)) {
    const parts = path.split('/')
    parts.pop()
    let node = root
    for (const part of parts) {
      let next = node.dirs.get(part)
      if (!next) {
        next = rawNode(node.dir ? `${node.dir}/${part}` : part, part)
        node.dirs.set(part, next)
      }
      node = next
    }
    node.files.push(path)
  }
  return finish(root, true)
}

/** The package whose real folder path is `dir` ('' = the root); null when no package has it (e.g. a merged-away folder). */
export function findBlueprintPackage(root: BlueprintPackage, dir: string): BlueprintPackage | null {
  if (root.dir === dir) return root
  for (const child of root.packages) {
    const found = findBlueprintPackage(child, dir)
    if (found) return found
  }
  return null
}
