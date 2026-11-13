import { Button } from '@/components/ui/button'

export interface SelectionBarProps {
  /** Files picked (files, not boxes). */
  count: number
  /** Said for a moment after "Approve all": how many files it approved, with an Undo. */
  approved: { count: number; onUndo: () => void } | null
  onViewAll: () => void
  onApproveAll: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDone: () => void
}

const FLAT = 'shadow-none'

/** The bar at the top centre of the canvas while select mode is on: what is picked and what to do with it. The top, because the canvas can run below the fold. */
export function SelectionBar({ count, approved, onViewAll, onApproveAll, onSelectAll, onDeselectAll, onDone }: SelectionBarProps) {
  const none = count === 0
  return (
    <div
      role="toolbar"
      aria-label="Selected files"
      data-slot="selection-bar"
      className="absolute inset-x-4 top-3 z-20 mx-auto flex w-fit flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-xl border-fine border-line bg-surface px-3 py-2 text-[13px]"
    >
      {approved ? (
        <span role="status" className="flex items-center gap-2 font-bold tabular-nums">
          Approved {approved.count} {approved.count === 1 ? 'file' : 'files'}
          <Button size="sm" variant="ghost" className="h-7 underline" onClick={approved.onUndo}>
            Undo
          </Button>
        </span>
      ) : (
        <span role="status" className="px-1 font-bold tabular-nums">
          {none ? 'Nothing selected' : `${count} selected`}
        </span>
      )}
      <Button size="sm" variant="primary" className={FLAT} disabled={none} onClick={onViewAll}>
        View all
      </Button>
      <Button size="sm" variant="approve" className={FLAT} disabled={none} onClick={onApproveAll}>
        Approve all
      </Button>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <Button size="sm" variant="ghost" onClick={onSelectAll}>
        Select all
      </Button>
      <Button size="sm" variant="ghost" disabled={none} onClick={onDeselectAll}>
        Deselect all
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
