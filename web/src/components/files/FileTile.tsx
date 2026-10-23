import type { TreeFile, Verdict } from '@review-dash/shared'
import { CheckIcon, XIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/status-dot'
import { fileTypeClass, fileTypeOf } from '@/lib/file-type'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { splitPath } from '@/lib/paths'
import type { PrFileCounts } from '@/lib/pr-threads'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { ChangeBar } from './ChangeBar'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'
import { FileTileFooter } from './FileTileFooter'

export interface FileTileProps {
  file: TreeFile
  current: boolean
  verdict: Verdict
  viewed: boolean
  openComments: number
  updated: boolean
  /** GitHub threads on the file (absent when none). */
  prComments?: PrFileCounts
  /** False for a scope file with no net change in the full diff: no verdict controls. */
  reviewable?: boolean
  onOpen: () => void
  onApprove: () => void
  onClearVerdict?: () => void
}

/**
 * The verdict is an outlined corner stamp on an otherwise neutral tile: tinting the tile as well put a
 * green or red wash over the file type's band (JSON is green, YAML orange), three hues deep.
 */
const VERDICT_STAMP: Record<Exclude<Verdict, 'none'>, string> = {
  approved: 'border-ok-bd text-green',
  rejected: 'border-err-bd text-red',
}

/**
 * A compact card for the grid: a band in the file type's colour, the path, the status with its dot,
 * the size of the change and the review state; no diff. `A` approves a focused tile.
 */
export function FileTile({ file, current, verdict, viewed, openComments, updated, prComments, reviewable = true, onOpen, onApprove, onClearVerdict }: FileTileProps) {
  const { report } = useCurrentPrReport()
  const proposals = report?.findings.filter((f) => f.path === file.path).length ?? 0
  const { dir, name } = splitPath(file.path)
  const status = STATUS_TONE.file(file.status)
  const renamedFrom = file.oldPath !== null && file.oldPath !== file.path ? file.oldPath : null
  const title = renamedFrom ? `${file.path}\nrenamed from ${renamedFrom}` : file.path
  const stamp = verdict === 'none' ? null : VERDICT_STAMP[verdict]

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
        fileTypeClass(fileTypeOf(file.path).id),
        'group relative rounded-xl border-fine border-line bg-surface text-ink transition-colors hover:bg-paper-2',
        // Paint containment would clip a ring on the inner button, so the tile itself shows keyboard focus.
        '[contain-intrinsic-size:auto_128px] [content-visibility:auto]',
        'has-[>button:focus-visible]:outline-[3px] has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-focus',
        current && 'border-ink ring-2 ring-ink',
      )}
    >
      {/* The file-type band along the top edge. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[7px] rounded-t-[10px] border-b-fine border-fill-line bg-ft" />
      {stamp && (
        <Button size="icon-sm" data-verdict-overlay={verdict} aria-label={`Clear ${verdict === 'approved' ? 'approval' : 'rejection'} ${file.path}`} title={`Clear ${verdict === 'approved' ? 'approval' : 'rejection'}`} aria-pressed disabled={!reviewable || !onClearVerdict} onClick={onClearVerdict} className={cn('absolute top-2.5 right-2 z-20 size-[26px] rounded-full border-[2px] bg-surface shadow-none', stamp)}>
          {verdict === 'approved' ? <CheckIcon aria-hidden className="size-[13px] stroke-[3]" /> : <XIcon aria-hidden className="size-[13px] stroke-[3]" />}
        </Button>
      )}
      <button
        type="button"
        aria-label={file.path}
        aria-current={current || undefined}
        title={title}
        onClick={onOpen}
        className="flex w-full flex-col gap-[9px] rounded-[inherit] px-3.5 pt-5 pb-[13px] text-left focus-visible:outline-none"
      >
        <span className="flex w-full min-w-0 flex-col gap-0.5 pr-[30px] font-mono">
          {/* `dir="rtl"` keeps the end of a long path visible: the leading folders are what gets cut. */}
          <span className="truncate text-left text-xs leading-4 text-ink-muted" dir="rtl">
            <bdi>{dir || ' '}</bdi>
          </span>
          <span className="truncate text-sm leading-[19px] font-bold">{name}</span>
        </span>
        <span className="flex w-full items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <StatusDot tone={status.tone} label="" className="border-fine border-fill-line" />
            {status.label}
          </span>
          <span className="ml-auto inline-flex gap-[7px] font-mono font-bold tabular-nums">
            <span className="text-green">{formatAdditions(file.additions)}</span>
            <span className="text-red">{formatDeletions(file.deletions)}</span>
          </span>
          <ChangeBar additions={file.additions} deletions={file.deletions} />
        </span>
        {proposals > 0 && <span className="text-xs font-semibold text-ink-muted">{proposals} proposed comments</span>}
        <FileTileFooter file={file} verdict={verdict} viewed={viewed} openComments={openComments} updated={updated} prComments={prComments} reviewable={reviewable} />
      </button>
      {reviewable && verdict === 'none' && (
        <Button
          size="icon-sm"
          aria-label={`Approve ${file.path}`}
          title="Approve (A)"
          onClick={onApprove}
          className={cn(
            'absolute top-2.5 right-2 z-20 size-[26px] rounded-full border-ok-bd/60 bg-surface text-green shadow-none',
            'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-mint hover:text-hdr-ink focus-visible:opacity-100',
            '[&_svg:not([class*="size-"])]:size-[13px] [&_svg]:stroke-[3]',
          )}
        >
          <CheckIcon aria-hidden />
        </Button>
      )}
    </li>
  )
}
