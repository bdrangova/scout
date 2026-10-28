import type { Verdict } from '@scout/shared'
import { Check, ChevronDown, Folder, FolderOpen, MessageSquare, MessageSquareText, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { FileTypeDot } from '@/components/ui/file-type-dot'
import { PrCount } from '@/components/prcomments/PrCount'
import { StatusDot } from '@/components/ui/status-dot'
import type { FlatRow } from '@/lib/file-tree'
import { fileTypeOf } from '@/lib/file-type'
import type { PrFileCounts } from '@/lib/pr-threads'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

export interface FileRowState {
  verdict: Verdict
  openComments: number
  updated: boolean
  /** GitHub threads on the file (absent when none). */
  proposals?: number
  prComments?: PrFileCounts
}

interface FileTreeRowProps {
  row: FlatRow
  expanded: boolean
  current: boolean
  focused: boolean
  /** Folder rows: `reviewed/total` below it. File rows: its review state. */
  count?: { reviewed: number; total: number }
  state?: FileRowState
  onActivate: () => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

const INDENT_PX = 18

/**
 * One `treeitem` row (32px, fine transparent line, yellow when current): a folder with its chevron
 * and `reviewed/total`, or a file with its type dot, mono name and the review marks at the right
 * (changed since reviewed, open comments, the verdict). A deleted file's name is struck through.
 */
export function FileTreeRow({ row, expanded, current, focused, count, state, onActivate, onFocus, onKeyDown }: FileTreeRowProps) {
  const { node, depth } = row
  const folder = node.kind === 'folder'
  const FolderIcon = expanded ? FolderOpen : Folder
  const status = folder ? null : STATUS_TONE.file(node.file.status)

  return (
    <div
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      aria-level={depth + 1}
      aria-expanded={folder ? expanded : undefined}
      aria-selected={folder ? undefined : current}
      data-id={node.id}
      data-current={current || undefined}
      title={folder ? undefined : `${node.id} · ${status?.label}`}
      style={{ paddingLeft: 8 + depth * INDENT_PX }}
      onClick={onActivate}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        'flex h-8 shrink-0 cursor-pointer items-center gap-[7px] rounded-[9px] border-fine border-transparent pr-2 text-[13px] font-medium whitespace-nowrap text-ink transition-colors select-none',
        'hover:bg-hover [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:stroke-[2.25] [&_svg]:text-ink-muted',
        folder && 'font-bold',
        current && 'border-line bg-yellow font-bold text-on-yellow hover:bg-yellow [&_svg]:text-on-yellow',
      )}
    >
      {folder ? (
        <>
          <ChevronDown aria-hidden className={cn('size-[13px]! transition-transform', !expanded && '-rotate-90')} />
          <FolderIcon aria-hidden />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {count && (
            <span className={cn('shrink-0 text-[11.5px] font-semibold tabular-nums', current ? 'text-on-yellow' : 'text-ink-muted')}>
              {count.reviewed}/{count.total}
            </span>
          )}
        </>
      ) : (
        <>
          <FileTypeDot type={fileTypeOf(node.id).id} size="sm" aria-hidden className={cn('mx-px', current && 'ring-[1.5px] ring-on-yellow')} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-[12.5px]',
              node.file.status === 'deleted' && 'line-through',
              node.file.status === 'deleted' && !current && 'text-ink-muted',
            )}
          >
            {node.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {!!state?.proposals && <span className="text-[11px] tabular-nums" aria-label={`${state.proposals} proposed comments`} title={`${state.proposals} proposed comments`}><MessageSquareText aria-hidden className="inline size-3!" /> {state.proposals}</span>}
            {state?.updated && (
              <StatusDot
                tone="warn"
                size="sm"
                role="img"
                aria-label="updated"
                title="Changed on disk since you reviewed it"
                className={cn(current && 'bg-on-yellow')}
                label=""
              />
            )}
            {state && state.openComments > 0 && (
              <span
                title={`${state.openComments} open ${state.openComments === 1 ? 'comment' : 'comments'}`}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums"
              >
                <MessageSquare aria-hidden className="size-3!" />
                {state.openComments}
                <span className="sr-only">open {state.openComments === 1 ? 'comment' : 'comments'}</span>
              </span>
            )}
            {state?.prComments && <PrCount counts={state.prComments} />}
            {state?.verdict === 'approved' && (
              <span title="Approved" className="inline-flex">
                <Check role="img" aria-label="approved" className={cn('size-3.5! stroke-[3]!', !current && 'text-green!')} />
              </span>
            )}
            {state?.verdict === 'rejected' && (
              <span title="Changes requested" className="inline-flex">
                <X role="img" aria-label="rejected" className={cn('size-3.5! stroke-[3]!', !current && 'text-red!')} />
              </span>
            )}
          </span>
        </>
      )}
    </div>
  )
}
