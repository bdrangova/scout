import { blueprintDiagramFiles, type Blueprint, type BlueprintBox, type BlueprintDiagram, type BlueprintFile, type TreeFile, type Verdict } from '@scout/shared'

/** What a file box shows beyond the diagram's own data. */
export interface FileBoxInfo {
  path: string
  file: BlueprintFile | null
  tree: TreeFile | null
  verdict: Verdict
  /** Scout's one-line summary of the file from the journal. */
  summary: string | null
  /** Position in the diagram's reading order (1-based). */
  order: number | null
  /** How many changed files import this one. */
  importers: number
  /** Whether the file has any import, importer or inheritance link to another changed file. */
  related: boolean
}

export interface BoxInfo {
  box: BlueprintBox
  additions: number
  deletions: number
  reviewed: number
  approved: number
  rejected: number
  /** Open comments on the box's files. */
  comments: number
  total: number
  /** Up to three of the biggest changed files (package boxes). */
  topNames: string[]
  /** A group's one-line purpose (package boxes of an agent grouping); null for folders and files. */
  purpose: string | null
  /** Set for a file box. */
  file: FileBoxInfo | null
}

export interface DescribeInput {
  diagram: BlueprintDiagram
  blueprint: Blueprint
  treeFiles: readonly TreeFile[]
  verdictOf: (file: TreeFile) => Verdict
  summaryOf: (path: string) => string | null
  /** Open comments on a file (default: none). */
  commentsOf?: (path: string) => number
  /** The purpose of the package at `dir` (agent groupings); default: none. */
  purposeOf?: (dir: string) => string | null
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Everything the boxes of a diagram display, computed once per diagram and review state. */
export function describeBoxes({ diagram, blueprint, treeFiles, verdictOf, summaryOf, commentsOf = () => 0, purposeOf = () => null }: DescribeInput): Map<string, BoxInfo> {
  const treeByPath = new Map(treeFiles.map((file) => [file.path, file]))
  const fileByPath = new Map(blueprint.files.map((file) => [file.path, file]))
  const importers = new Map<string, number>()
  for (const file of blueprint.files) for (const target of file.imports) importers.set(target, (importers.get(target) ?? 0) + 1)
  const order = new Map(blueprintDiagramFiles(diagram).map((path, index) => [path, index + 1]))

  const infos = new Map<string, BoxInfo>()
  for (const box of diagram.boxes) {
    const trees = box.files.map((path) => treeByPath.get(path)).filter((file): file is TreeFile => file !== undefined)
    const verdicts = trees.map((file) => verdictOf(file))
    const biggest = [...trees].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || (a.path < b.path ? -1 : 1))
    const path = box.ref.type === 'file' ? box.ref.path : null
    const file = path === null ? null : (fileByPath.get(path) ?? null)
    infos.set(box.key, {
      box,
      additions: trees.reduce((sum, item) => sum + item.additions, 0),
      deletions: trees.reduce((sum, item) => sum + item.deletions, 0),
      reviewed: verdicts.filter((verdict) => verdict !== 'none').length,
      approved: verdicts.filter((verdict) => verdict === 'approved').length,
      rejected: verdicts.filter((verdict) => verdict === 'rejected').length,
      comments: box.files.reduce((sum, item) => sum + commentsOf(item), 0),
      total: box.files.length,
      topNames: biggest.slice(0, 3).map((item) => baseName(item.path)),
      purpose: box.ref.type === 'dir' ? purposeOf(box.ref.dir) : null,
      file:
        path === null
          ? null
          : {
              path,
              file,
              tree: treeByPath.get(path) ?? null,
              verdict: verdicts[0] ?? 'none',
              summary: summaryOf(path),
              order: order.get(path) ?? null,
              importers: importers.get(path) ?? 0,
              related: file !== null && (file.imports.length > 0 || (importers.get(path) ?? 0) > 0),
            },
    })
  }
  return infos
}
