// Merges a folder listing with the agent's optional index.json: indexed files first (by `order`,
// then index position), index entries whose file is missing dropped, then the rest sorted by filename.

export interface IndexedEntry {
  file: string
  order?: number | undefined
}

export interface MergedEntry<T extends IndexedEntry> {
  file: string
  /** The index entry, or null for a file the index does not mention. */
  entry: T | null
  /** Final 0-based position. */
  order: number
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function mergeIndex<T extends IndexedEntry>(files: readonly string[], index: readonly T[] | null): MergedEntry<T>[] {
  const present = new Set(files)
  const indexed = (index ?? [])
    .map((entry, position) => ({ entry, position }))
    .filter(({ entry }) => present.has(entry.file))
    .sort((a, b) => {
      const ao = a.entry.order ?? Number.POSITIVE_INFINITY
      const bo = b.entry.order ?? Number.POSITIVE_INFINITY
      return ao !== bo ? ao - bo : a.position - b.position
    })
  const seen = new Set<string>()
  const merged: MergedEntry<T>[] = []
  for (const { entry } of indexed) {
    if (seen.has(entry.file)) continue
    seen.add(entry.file)
    merged.push({ file: entry.file, entry, order: merged.length })
  }
  for (const file of [...files].sort(comparePaths)) {
    if (seen.has(file)) continue
    seen.add(file)
    merged.push({ file, entry: null, order: merged.length })
  }
  return merged
}
