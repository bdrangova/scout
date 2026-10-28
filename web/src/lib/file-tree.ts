import type { TreeFile } from '@scout/shared'

/** A folder row; `id` is its full path, `name` what the row shows (`src/components/diff` once collapsed). */
export interface FolderNode {
  kind: 'folder'
  id: string
  name: string
  children: TreeNode[]
  /** Every file path below it, for the `reviewed/total` count. */
  paths: string[]
}

export interface FileNode {
  kind: 'file'
  /** The file's path. */
  id: string
  name: string
  file: TreeFile
}

export type TreeNode = FolderNode | FileNode

export interface FlatRow {
  node: TreeNode
  depth: number
  parentId: string | null
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Case-insensitive, digit-aware (`file2` before `file10`). */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

interface RawFolder {
  folders: Map<string, RawFolder>
  files: TreeFile[]
}

function newRawFolder(): RawFolder {
  return { folders: new Map(), files: [] }
}

function toNodes(raw: RawFolder, prefix: string): TreeNode[] {
  const folders: FolderNode[] = []
  for (const [name, child] of raw.folders) {
    folders.push(toFolder(child, name, prefix))
  }
  folders.sort((a, b) => naturalCompare(a.name, b.name))
  const files: FileNode[] = raw.files
    .map((file): FileNode => ({ kind: 'file', id: file.path, name: file.path.slice(file.path.lastIndexOf('/') + 1), file }))
    .sort((a, b) => naturalCompare(a.name, b.name))
  return [...folders, ...files]
}

/** Builds one folder node, swallowing single-child folder chains into its name. */
function toFolder(raw: RawFolder, name: string, prefix: string): FolderNode {
  let current = raw
  let label = name
  let id = prefix + name
  for (;;) {
    const only = current.files.length === 0 && current.folders.size === 1 ? current.folders.entries().next().value : undefined
    if (!only) break
    const [childName, child] = only
    label = `${label}/${childName}`
    id = `${id}/${childName}`
    current = child
  }
  const children = toNodes(current, `${id}/`)
  const paths: string[] = []
  for (const child of children) {
    if (child.kind === 'file') paths.push(child.id)
    else paths.push(...child.paths)
  }
  return { kind: 'folder', id, name: label, children, paths }
}

/** Folders first then files, natural order, single-child folder chains collapsed into one row. */
export function buildFileTree(files: readonly TreeFile[]): TreeNode[] {
  const root = newRawFolder()
  for (const file of files) {
    const segments = file.path.split('/')
    let folder = root
    for (const segment of segments.slice(0, -1)) {
      let next = folder.folders.get(segment)
      if (!next) {
        next = newRawFolder()
        folder.folders.set(segment, next)
      }
      folder = next
    }
    folder.files.push(file)
  }
  return toNodes(root, '')
}

/** The files whose path contains `query` (case-insensitive) and the folders that lead to them. */
export function filterTree(nodes: readonly TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...nodes]
  const out: TreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (node.id.toLowerCase().includes(needle)) out.push(node)
      continue
    }
    const children = filterTree(node.children, needle)
    if (children.length === 0) continue
    const paths = children.flatMap((child) => (child.kind === 'file' ? [child.id] : child.paths))
    out.push({ ...node, children, paths })
  }
  return out
}

/** The rows a tree shows, in order, given which folders are open. */
export function flattenTree(nodes: readonly TreeNode[], isExpanded: (folderId: string) => boolean): FlatRow[] {
  const rows: FlatRow[] = []
  const walk = (list: readonly TreeNode[], depth: number, parentId: string | null) => {
    for (const node of list) {
      rows.push({ node, depth, parentId })
      if (node.kind === 'folder' && isExpanded(node.id)) walk(node.children, depth + 1, node.id)
    }
  }
  walk(nodes, 0, null)
  return rows
}

export function allFolderIds(nodes: readonly TreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    ids.push(node.id, ...allFolderIds(node.children))
  }
  return ids
}

/** The folder ids on the way down to `path` (outermost first); empty for a root-level file. */
export function ancestorsOf(nodes: readonly TreeNode[], path: string): string[] {
  const ids: string[] = []
  let level: readonly TreeNode[] = nodes
  for (;;) {
    const folder = level.find((node): node is FolderNode => node.kind === 'folder' && path.startsWith(`${node.id}/`))
    if (!folder) return ids
    ids.push(folder.id)
    level = folder.children
  }
}

export function countReviewed(paths: readonly string[], isReviewed: (path: string) => boolean): number {
  let reviewed = 0
  for (const path of paths) if (isReviewed(path)) reviewed += 1
  return reviewed
}
