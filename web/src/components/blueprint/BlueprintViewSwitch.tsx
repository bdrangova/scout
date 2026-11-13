import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import type { BlueprintView } from '@/lib/blueprint'

const VIEWS: readonly { view: BlueprintView; label: string }[] = [
  { view: 'folders', label: 'Folders' },
  { view: 'feature', label: 'Feature' },
  { view: 'layer', label: 'Layer' },
  { view: 'priority', label: 'Priority' },
]

/** How the change is cut into boxes: by folder (Scout's own tree) or by one of the agent's groupings. */
export function BlueprintViewSwitch({ view, onChange }: { view: BlueprintView; onChange: (view: BlueprintView) => void }) {
  return (
    <Segmented aria-label="Group the change by">
      {VIEWS.map((item) => (
        <SegmentedItem key={item.view} pressed={view === item.view} onClick={() => onChange(item.view)}>
          {item.label}
        </SegmentedItem>
      ))}
    </Segmented>
  )
}
