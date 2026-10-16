import type { EvidenceIndex, EvidenceItem } from '../schemas/artifacts.ts'
import { mergeIndex } from './merge-index.ts'
import { basename } from './titles.ts'
import { evidenceTypeFromPath } from './types.ts'

/**
 * `files` are paths relative to `evidence/` (posix). Files that are not images or videos are
 * ignored, as is `index.json` itself.
 */
export function deriveEvidence(files: readonly string[], index: EvidenceIndex | null): EvidenceItem[] {
  const media = files.filter((file) => evidenceTypeFromPath(file) !== null)
  const items: EvidenceItem[] = []
  for (const { file, entry, order } of mergeIndex(media, index?.items ?? null)) {
    const type = evidenceTypeFromPath(file)
    if (type === null) continue
    const caption = entry?.caption?.trim()
    items.push({
      path: file,
      type,
      caption: caption === undefined || caption === '' ? basename(file) : caption,
      description: entry?.description ?? null,
      order,
    })
  }
  return items
}
