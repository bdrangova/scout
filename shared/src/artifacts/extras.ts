import type { ExtraItem, ExtrasIndex } from '../schemas/artifacts.ts'
import { mergeIndex } from './merge-index.ts'
import { deriveTitle } from './titles.ts'
import { extraTypeFromPath } from './types.ts'

/**
 * `files` are paths relative to `extras/` (posix); `readText` returns a file's content (or null)
 * and is only called for files whose title the index does not give.
 */
export function deriveExtras(
  files: readonly string[],
  index: ExtrasIndex | null,
  readText: (file: string) => string | null,
): ExtraItem[] {
  const known = files.filter((file) => extraTypeFromPath(file) !== null)
  const items: ExtraItem[] = []
  for (const { file, entry } of mergeIndex(known, index?.items ?? null)) {
    const type = extraTypeFromPath(file)
    if (type === null) continue
    const explicit = entry?.title
    const content = explicit !== undefined && explicit.trim() !== '' ? null : readText(file)
    items.push({ path: file, type, title: deriveTitle(file, explicit, content) })
  }
  return items
}
