import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface FileTreeHeaderProps {
  count: number
  /** Every folder is open, so the one toggle offers to collapse; otherwise it expands everything. */
  allExpanded: boolean
  /** Disabled while filtering (the matches decide what is open). */
  disabled?: boolean
  /** The whole block is folded down to this header. */
  collapsed: boolean
  onToggleCollapsed: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

/** The block's fold chevron (front), `Files · 12` and the single expand/collapse-all toggle (hidden while folded). */
export function FileTreeHeader({ count, allExpanded, disabled = false, collapsed, onToggleCollapsed, onExpandAll, onCollapseAll }: FileTreeHeaderProps) {
  const label = allExpanded ? 'Collapse all' : 'Expand all'
  const Icon = allExpanded ? ChevronsDownUp : ChevronsUpDown
  const foldLabel = collapsed ? 'Expand files' : 'Collapse files'
  const FoldIcon = collapsed ? ChevronRight : ChevronDown
  return (
    <div className="flex shrink-0 items-center gap-2 px-2 pb-2.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-1 size-7 rounded-md"
        aria-label={foldLabel}
        title={foldLabel}
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        <FoldIcon aria-hidden className="size-3.5" />
      </Button>
      <strong className="text-[15px] font-bold">Files</strong>
      <Badge>{count}</Badge>
      {!collapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-7 rounded-md"
          aria-label={label}
          title={`${label} folders`}
          disabled={disabled}
          onClick={allExpanded ? onCollapseAll : onExpandAll}
        >
          <Icon aria-hidden className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
