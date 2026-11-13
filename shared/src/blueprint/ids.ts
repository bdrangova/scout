/**
 * Ids shared by the Blueprint page, the Files page (`?bp=`) and the saved layout.
 *
 * A diagram is either a package (a folder of the package tree, '' = the whole change) or the neighbourhood of one file.
 * A box is either a sub-package (folder) or a file.
 */
export type BlueprintDiagramRef = { type: 'package'; dir: string } | { type: 'around'; path: string }
export type BlueprintBoxRef = { type: 'dir'; dir: string } | { type: 'file'; path: string }

/** The id of the whole-change diagram. */
export const BLUEPRINT_ROOT_DIAGRAM = 'pkg:'

export function blueprintDiagramId(ref: BlueprintDiagramRef): string {
  return ref.type === 'package' ? `pkg:${ref.dir}` : `around:${ref.path}`
}

/** Null for anything that is not a diagram id. */
export function parseBlueprintDiagramId(id: string | null | undefined): BlueprintDiagramRef | null {
  if (typeof id !== 'string') return null
  if (id.startsWith('pkg:')) return { type: 'package', dir: id.slice(4) }
  if (id.startsWith('around:') && id.length > 7) return { type: 'around', path: id.slice(7) }
  return null
}

export function blueprintBoxKey(ref: BlueprintBoxRef): string {
  return ref.type === 'dir' ? `dir:${ref.dir}` : `file:${ref.path}`
}

export function parseBlueprintBoxKey(key: string): BlueprintBoxRef | null {
  if (key.startsWith('dir:')) return { type: 'dir', dir: key.slice(4) }
  if (key.startsWith('file:') && key.length > 5) return { type: 'file', path: key.slice(5) }
  return null
}
