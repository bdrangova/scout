import type { SpecIndex, SpecItem } from '../schemas/artifacts.ts'
import { mergeIndex } from './merge-index.ts'
import { deriveTitle } from './titles.ts'
import { specTypeFromPath } from './types.ts'

/**
 * `files` are paths relative to `spec/` (posix); `readText` is only called for files whose title
 * the index does not give. Type: index value, else `.html` → artifact, `jira*` → jira, else markdown.
 */
export function deriveSpec(
  files: readonly string[],
  index: SpecIndex | null,
  readText: (file: string) => string | null,
): SpecItem[] {
  const known = files.filter((file) => specTypeFromPath(file) !== null)
  const items: SpecItem[] = []
  for (const { file, entry } of mergeIndex(known, index?.items ?? null)) {
    const type = entry?.type ?? specTypeFromPath(file)
    if (type === null) continue
    const explicit = entry?.title
    const content = explicit !== undefined && explicit.trim() !== '' ? null : readText(file)
    items.push({
      path: file,
      type,
      title: deriveTitle(file, explicit, content),
      url: entry?.url ?? null,
      sourcePath: entry?.sourcePath ?? null,
      capturedAt: entry?.capturedAt ?? null,
    })
  }
  return items
}
