import type { EvidenceItem } from '@scout/shared'
import { useCommentedOnlyFilter, useOpenCommentRefs } from '@/components/layout/commented-only'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { RailSection } from '@/components/layout/RailSlot'
import { evidenceCounts } from './evidence-counts'
import { EvidenceThumb } from './EvidenceThumb'

export interface EvidenceRailProps {
  items: readonly EvidenceItem[]
  sessionId: string
  currentPath: string
  onSelect: (path: string) => void
}

/** The Evidence page's block in the session rail: a titled, scrollable list of the items. */
export function EvidenceRail({ items, sessionId, currentPath, onSelect }: EvidenceRailProps) {
  const { images, videos } = evidenceCounts(items)
  const openRefs = useOpenCommentRefs('evidence')
  const commented = useCommentedOnlyFilter(items, (item) => openRefs.has(item.path))
  const summary = [images > 0 ? `${images} ${images === 1 ? 'image' : 'images'}` : null, videos > 0 ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : null].filter(Boolean).join(' · ')
  return (
    <RailSection>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 pt-3.5 pb-2">
        <div className="flex items-baseline gap-2 px-1">
          <h2 className="m-0 text-[13px] font-bold">Evidence</h2>
          <span className="text-xs font-semibold text-ink-muted tabular-nums">{commented.active ? `${commented.items.length} of ${items.length}` : items.length}</span>
          <span className="ml-auto truncate text-xs font-medium text-ink-muted">{summary}</span>
          <CommentedOnlyToggle size="sm" count={commented.count} active={commented.active} onToggle={commented.toggle} className="self-center" />
        </div>
        <ul aria-label="Evidence items" className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-0 pr-0.5 pb-1">
          {commented.items.map((item) => (
            <EvidenceThumb key={item.path} item={item} position={items.indexOf(item) + 1} sessionId={sessionId} current={item.path === currentPath} onSelect={onSelect} />
          ))}
        </ul>
      </div>
    </RailSection>
  )
}
