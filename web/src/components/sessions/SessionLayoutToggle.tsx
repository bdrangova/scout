import { LayoutGrid, List } from 'lucide-react'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import type { SessionListLayout } from './session-list-layout'

export function SessionLayoutToggle({ layout, onLayout }: { layout: SessionListLayout; onLayout: (layout: SessionListLayout) => void }) {
  return (
    <Segmented aria-label="Session layout">
      <SegmentedItem pressed={layout === 'list'} onClick={() => onLayout('list')} aria-label="List view" title="List view"><List aria-hidden /><span className="max-sm:sr-only">List</span></SegmentedItem>
      <SegmentedItem pressed={layout === 'grid'} onClick={() => onLayout('grid')} aria-label="Grid view" title="Grid view"><LayoutGrid aria-hidden /><span className="max-sm:sr-only">Grid</span></SegmentedItem>
    </Segmented>
  )
}
