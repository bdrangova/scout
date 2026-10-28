import type { TreeFile } from '@scout/shared'
import { Columns2, Eye, Files, Rows3, type LucideIcon } from 'lucide-react'
import type { PointerEvent } from 'react'
import { PrCardChip } from '@/components/prcomments/PrCardChip'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import type { PrFileCounts } from '@/lib/pr-threads'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import type { DiffStyle } from './FileDiffView'
import { FileStatusChips } from './FileStatusChips'

/** What the card body shows: one of the diff layouts, or the rendered markdown of a `.md` file. */
export type CardView = DiffStyle | 'preview'

const VIEW_META: Record<CardView, { label: string; title: string; text: string; icon: LucideIcon }> = {
  unified: { label: 'Unified diff', title: 'Unified', text: 'Unified', icon: Rows3 },
  split: { label: 'Split diff', title: 'Split', text: 'Split', icon: Columns2 },
  preview: { label: 'Preview', title: 'Rendered markdown', text: 'Preview', icon: Eye },
}

export interface CardHeaderProps {
  file: TreeFile
  /** `8 / 12` in the header. */
  position?: { index: number; total: number }
  updated: boolean
  /** GitHub threads on this file; the chip is left out when absent or zero. */
  prComments?: PrFileCounts
  changedJustNow: boolean
  view: CardView
  views: readonly CardView[]
  onViewChange: (view: CardView) => void
  /** Swipe mode starts the drag from the header. */
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
}

/**
 * The accent strip of the review card: the path (folder above, name and chips
 * below, "renamed from" under), then the delta, the position and the layout chooser. The strip's
 * background is the file type's colour (`bg-ft` from the `ft-*` class on the card), with ink text.
 */
export function CardHeader({ file, position, updated, prComments, changedJustNow, view, views, onViewChange, onPointerDown }: CardHeaderProps) {
  const { dir, name } = splitPath(file.path)
  const renamedFrom = file.oldPath !== null && file.oldPath !== file.path ? file.oldPath : null

  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex shrink-0 items-start gap-3 border-b-fine border-fill-line bg-ft px-4 py-3 text-hdr-ink',
        changedJustNow && 'animate-pulse',
        onPointerDown && 'cursor-grab select-none',
      )}
      style={onPointerDown ? { touchAction: 'none' } : undefined}
      onPointerDown={onPointerDown}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {/* `dir="rtl"` keeps the end of a long path visible: the leading folders are what gets cut. */}
        <span className={cn('truncate text-left font-mono text-xs opacity-90', !dir && 'hidden sm:block sm:min-h-4')} dir="rtl" title={dir || undefined}>
          <bdi>{dir}</bdi>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate font-mono text-base font-bold" title={file.path}>
            {name}
          </span>
          <FileStatusChips file={file} updated={updated} changedJustNow={changedJustNow} />
          {prComments && <PrCardChip counts={prComments} />}
        </span>
        {renamedFrom && (
          <span className="truncate font-mono text-xs opacity-90" title={renamedFrom}>
            renamed from {renamedFrom}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-0.5 whitespace-nowrap">
        <span className="flex gap-2 font-mono text-[13px] font-bold tabular-nums">
          <span>{formatAdditions(file.additions)}</span>
          <span>{formatDeletions(file.deletions)}</span>
        </span>
        {position && <Position index={position.index} total={position.total} />}
        {views.length > 0 && (
          <Segmented aria-label="Diff layout" className="bg-surface">
            {views.map((option) => {
              const { label, title, text, icon: Icon } = VIEW_META[option]
              return (
                <SegmentedItem key={option} pressed={view === option} onClick={() => onViewChange(option)} aria-label={label} title={title}>
                  <Icon aria-hidden />
                  <span aria-hidden className="hidden lg:inline">
                    {text}
                  </span>
                </SegmentedItem>
              )
            })}
          </Segmented>
        )}
      </div>
    </div>
  )
}

/** `8 / 12` with a files icon; screen readers get "file 8 of 12". */
function Position({ index, total }: { index: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums" title={`File ${index + 1} of ${total}`}>
      <Files aria-hidden className="size-[13px]" />
      <span className="sr-only">
        file {index + 1} of {total}
      </span>
      <span aria-hidden>
        {index + 1}
        <span className="opacity-60"> / </span>
        {total}
      </span>
    </span>
  )
}
