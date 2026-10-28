import type { EvidenceItem } from '@scout/shared'

export function evidenceCounts(items: readonly EvidenceItem[]) {
  const images = items.filter((item) => item.type === 'image').length
  return { images, videos: items.length - images }
}
