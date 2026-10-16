import type { TreeFile, Verdict } from '@review-dash/shared'
import { Check, MessageSquare, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { BINARY_BADGE, fileStatusBadge } from '@/lib/file-status'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { ChangeBar } from './ChangeBar'

export interface FileTileProps {
  file: TreeFile
  current: boolean
  verdict: Verdict
  viewed: boolean
  openComments: number
  updated: boolean
  /** False for a scope file with no net change in the full diff: no verdict controls. */
  reviewable?: boolean
  onOpen: () => void
  onApprove: () => void
}

const CHIP = 'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-semibold tracking-wide uppercase'

/** A compact card for the grid: path, status, size of the change and the review state (tinted like the full card's `VerdictOverlay`); no diff. */
export function FileTile({ file, current, verdict, viewed, openComments, updated, reviewable = true, onOpen, onApprove }: FileTileProps) {
  const { dir, name } = splitPath(file.path)
  const badge = fileStatusBadge(file)
  const renamedFrom = file.oldPath !== null && file.oldPath !== file.path ? file.oldPath : null
  const title = renamedFrom ? `${file.path}\nrenamed from ${renamedFrom}` : file.path

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if ((event.key === 'a' || event.key === 'A') && reviewable && verdict !== 'approved') {
      event.preventDefault()
      onApprove()
    }
  }

  return (
    <li
      data-path={file.path}
      data-verdict={verdict}
      data-current={current || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative rounded-xl border border-l-4 bg-card text-card-foreground shadow-[0_4px_14px_rgba(27,26,23,0.05)] transition-shadow',
        '[contain-intrinsic-size:auto_128px] [content-visibility:auto]',
        verdict === 'approved' ? 'border-l-approve' : verdict === 'rejected' ? 'border-l-reject' : 'border-l-border',
        current && 'ring-2 ring-foreground/30',
      )}
    >
      {verdict !== 'none' && (
        <span
          aria-hidden
          data-verdict-overlay={verdict}
          className={cn(
            'pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-colors',
            verdict === 'approved' ? 'bg-approve/10' : 'bg-reject/10',
          )}
        >
          <span
            className={cn(
              'absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full text-white shadow-[0_6px_18px_rgba(27,26,23,0.18)]',
              verdict === 'approved' ? 'bg-approve' : 'bg-reject',
            )}
          >
            {verdict === 'approved' ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
        </span>
      )}
      <button
        type="button"
        aria-label={file.path}
        title={title}
        onClick={onOpen}
        className="flex w-full flex-col gap-2 rounded-xl p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="flex w-full min-w-0 flex-col font-mono">
          {/* `dir="rtl"` keeps the end of a long path visible: the leading folders are what gets cut. */}
          <span className="truncate pr-7 text-left text-xs text-muted-foreground" dir="rtl">
            <bdi>{dir || ' '}</bdi>
          </span>
          <span className="truncate pr-7 text-sm font-semibold">{name}</span>
        </span>
        <span className="flex w-full items-center gap-2 text-xs">
          <span className={cn(CHIP, badge.className)}>{badge.label}</span>
          <span className="ml-auto font-semibold text-approve tabular-nums">{formatAdditions(file.additions)}</span>
          <span className="font-semibold text-reject tabular-nums">{formatDeletions(file.deletions)}</span>
          <ChangeBar additions={file.additions} deletions={file.deletions} />
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {verdict === 'approved' && (
            <span className="inline-flex items-center gap-1 font-medium text-approve">
              <Check aria-hidden className="size-3" /> approved
            </span>
          )}
          {verdict === 'rejected' && (
            <span className="inline-flex items-center gap-1 font-medium text-reject">
              <X aria-hidden className="size-3" /> rejected
            </span>
          )}
          {!reviewable && <span title="A later change undid this one, so there is nothing to review in the full diff">no net change in the full diff</span>}
          {reviewable && verdict === 'none' && openComments > 0 && <span>commented</span>}
          {reviewable && verdict === 'none' && openComments === 0 && viewed && <span>viewed</span>}
          {reviewable && verdict === 'none' && openComments === 0 && !viewed && <span>unreviewed</span>}
          {openComments > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`${openComments} open ${openComments === 1 ? 'comment' : 'comments'}`}>
              <MessageSquare aria-hidden className="size-3" /> {openComments}
            </span>
          )}
          {updated && (
            <span className={cn(CHIP, 'bg-warn/15 text-warn-foreground')} title="Changed on disk since you reviewed it">
              updated
            </span>
          )}
          {file.binary && <span className={cn(CHIP, BINARY_BADGE.className)}>{BINARY_BADGE.label}</span>}
          {file.omitted && <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>omitted</span>}
          {file.collapsed && !file.omitted && <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>collapsed</span>}
          {renamedFrom && (
            <span className={cn(CHIP, 'bg-info/10 text-info')} title={`renamed from ${renamedFrom}`}>
              renamed
            </span>
          )}
        </span>
      </button>
      {reviewable && verdict !== 'approved' && (
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Approve ${file.path}`}
          title="Approve (A)"
          onClick={onApprove}
          className="absolute top-2 right-2 z-20 border-approve/50 bg-card text-approve opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-approve/10 hover:text-approve focus-visible:opacity-100"
        >
          <Check aria-hidden />
        </Button>
      )}
    </li>
  )
}
