import type { Verdict } from '@review-dash/shared'
import { Check, ChevronRight, Folder, FolderOpen, MessageSquare, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { fileStatusDotClass } from '@/lib/file-status'
import type { FlatRow } from '@/lib/file-tree'
import { cn } from '@/lib/utils'

export interface FileRowState {
  verdict: Verdict
  openComments: number
  updated: boolean
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

const INDENT_PX = 14

/** One `treeitem` row: a folder with its chevron and count, or a file with its status and verdict. */
export function FileTreeRow({ row, expanded, current, focused, count, state, onActivate, onFocus, onKeyDown }: FileTreeRowProps) {
  const { node, depth } = row
  const folder = node.kind === 'folder'
  const Icon = folder ? (expanded ? FolderOpen : Folder) : null

  return (
    <div
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      aria-level={depth + 1}
      aria-expanded={folder ? expanded : undefined}
      aria-selected={folder ? undefined : current}
      data-id={node.id}
      data-current={current || undefined}
      title={folder ? undefined : node.id}
      style={{ paddingLeft: 8 + depth * INDENT_PX }}
      onClick={onActivate}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        'flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-[13px] outline-none select-none',
        'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60',
        current && 'bg-foreground/8 font-medium',
      )}
    >
      {folder ? (
        <>
          <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
          {Icon && <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 truncate">{node.name}</span>
          {count && (
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {count.reviewed}/{count.total}
            </span>
          )}
        </>
      ) : (
        <>
          <span aria-hidden className={cn('ml-[5px] size-2 shrink-0 rounded-full', fileStatusDotClass(node.file))} />
          <span className="min-w-0 truncate font-mono text-xs">{node.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {state?.updated && (
              <span role="img" aria-label="updated" title="Changed on disk since you reviewed it" className="size-1.5 rounded-full bg-warn" />
            )}
            {state && state.openComments > 0 && (
              <span
                title={`${state.openComments} open ${state.openComments === 1 ? 'comment' : 'comments'}`}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground tabular-nums"
              >
                <MessageSquare aria-hidden className="size-2.5" />
                {state.openComments}
              </span>
            )}
            {state?.verdict === 'approved' && <Check role="img" aria-label="approved" className="size-3.5 text-approve" />}
            {state?.verdict === 'rejected' && <X role="img" aria-label="rejected" className="size-3.5 text-reject" />}
          </span>
        </>
      )}
    </div>
  )
}
