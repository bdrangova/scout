import type { Scope, TreeFile } from '@review-dash/shared'
import { Check, FileX, Image as ImageIcon, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { Button } from '@/components/ui/button'
import { collapseReason, omitReason } from '@/lib/file-status'
import { formatAdditions, formatBytes, formatDeletions, formatNumber, pluralize } from '@/lib/format'
import { useFilePatch } from '@/lib/hooks'
import { fileContentsUrl, isImagePath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { canExpandContext, fetchFileSides } from './expand-context'
import { FileDiffView, type DiffStyle } from './FileDiffView'

interface LargeFileGateProps {
  file: TreeFile
  sessionId: string
  /** Read the patch and the contents from the scope's routes instead of the full diff's. */
  scope?: Scope | null
  diffStyle: DiffStyle
  /** When given, collapsed and omitted files offer "Approve without viewing". */
  onApprove?: () => void
}

/**
 * Decides what a card body shows: the live diff, a collapsed-file notice with "Show diff anyway"
 * (refetching with `force`), the binary view (before/after images from the contents route) or
 * the omission reason (never a "show anyway": the server has no patch for an omitted file, 410).
 * The patch is refetched whenever the file's fingerprint moves.
 */
export function LargeFileGate({ file, sessionId, scope = null, diffStyle, onApprove }: LargeFileGateProps) {
  const [force, setForce] = useState(false)
  const gated = file.collapsed && !force
  const enabled = !file.omitted && !file.binary && !gated
  const { patch, isLarge, isOmitted, loading, error, reload } = useFilePatch(sessionId, file.path, {
    force,
    enabled,
    fingerprint: file.fingerprint,
    scope,
  })
  // Hidden context is offered only where both sides are servable text; a scope whose revision
  // has no blob fails on the first reveal and the diff withdraws the offer.
  const expandable = canExpandContext(file)
  const loadSides = useMemo(
    () => (expandable ? () => fetchFileSides(sessionId, file.path, scope) : undefined),
    [expandable, sessionId, file.path, scope],
  )

  const approve = onApprove && (
    <Button size="sm" onClick={onApprove}>
      <Check aria-hidden />
      Approve without viewing
    </Button>
  )

  if (file.omitted || isOmitted) {
    return (
      <BodyNotice tone="err" icon={FileX} title="Diff omitted" action={approve}>
        <Stats file={file} />
        {' · '}
        {omitReason(file)}
      </BodyNotice>
    )
  }

  if (file.binary) return <BinaryView file={file} sessionId={sessionId} scope={scope} />

  if (gated || isLarge) {
    return (
      <BodyNotice
        tone="warn"
        icon={TriangleAlert}
        title="Collapsed by default"
        action={
          <>
            <Button size="sm" onClick={() => setForce(true)}>
              Show diff anyway
            </Button>
            {approve}
          </>
        }
      >
        <Stats file={file} />
        {file.sizeAfter !== null ? ` · ${formatBytes(file.sizeAfter)}` : ''}
        {` · ${collapseReason(file)}; rendering it may be slow.`}
      </BodyNotice>
    )
  }

  if (error) {
    return (
      <BodyNotice
        tone="err"
        icon={TriangleAlert}
        title="Couldn't load this diff"
        action={
          <Button size="sm" onClick={reload}>
            Retry
          </Button>
        }
      >
        {error.message}
      </BodyNotice>
    )
  }

  if (loading || patch === null) {
    return (
      <p className="px-6 py-8 text-sm text-ink-muted" aria-busy="true">
        Loading diff…
      </p>
    )
  }

  if (patch.trim() === '') {
    return <BodyNotice title="No textual changes">Contents unchanged.</BodyNotice>
  }

  return <FileDiffView patch={patch} diffStyle={diffStyle} loadSides={loadSides} path={file.path} />
}

/** `+2,400 −1,800 · 4,200 changed lines` */
function Stats({ file }: { file: TreeFile }) {
  return (
    <>
      <span className="font-mono font-bold text-green tabular-nums">{formatAdditions(file.additions)}</span>{' '}
      <span className="font-mono font-bold text-red tabular-nums">{formatDeletions(file.deletions)}</span>
      {` · ${pluralize(file.additions + file.deletions, 'changed line')}`}
    </>
  )
}

function BinaryView({ file, sessionId, scope }: { file: TreeFile; sessionId: string; scope: Scope | null }) {
  const image = isImagePath(file.path)
  // A side exists when the file has a size there: no "before" for added files, no "after" for deleted ones.
  const sides = [
    { side: 'before' as const, present: file.sizeBefore !== null },
    { side: 'after' as const, present: file.sizeAfter !== null },
  ].filter((entry) => entry.present)

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <BodyNotice icon={ImageIcon} title="Binary file" inline>
        {file.sizeAfter !== null ? formatBytes(file.sizeAfter) : 'No text diff'}
        {formatNumber(file.additions + file.deletions) !== '0' && ` · ${pluralize(file.additions + file.deletions, 'changed line')}`}
      </BodyNotice>
      {image && sides.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sides.map(({ side }) => (
            <figure key={side} className="flex flex-col gap-2">
              <Eyebrow as="figcaption">{side}</Eyebrow>
              <img
                // The fingerprint busts the browser cache when the file changes on disk.
                src={`${fileContentsUrl(sessionId, file.path, side, scope)}&v=${file.fingerprint}`}
                alt={`${file.path} (${side})`}
                className="max-h-[60vh] w-auto max-w-full rounded-lg border-fine border-line bg-[repeating-conic-gradient(var(--sunken)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] object-contain shadow-raised"
              />
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

type BodyNoticeTone = 'info' | 'warn' | 'err'

const TONE_ICON_CLASS: Record<BodyNoticeTone, string> = {
  info: 'bg-info-ic',
  warn: 'bg-warn-ic',
  err: 'bg-err-ic',
}

export interface BodyNoticeProps {
  title: string
  tone?: BodyNoticeTone
  icon?: LucideIcon
  action?: ReactNode
  children?: ReactNode
  inline?: boolean
}

/** A titled note for the card body: a round solid icon, a muted line and raised action buttons. */
export function BodyNotice({ title, tone = 'info', icon: Icon = Info, action, children, inline = false }: BodyNoticeProps) {
  return (
    <div className={cn('flex items-start gap-3', !inline && 'px-6 py-8')} data-slot="body-notice" data-tone={tone}>
      <span
        aria-hidden
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full border-fine border-fill-line text-hdr-ink shadow-icon [&_svg]:size-3.5 [&_svg]:stroke-[2.75]',
          TONE_ICON_CLASS[tone],
        )}
      >
        <Icon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        {children && <p className="text-sm text-ink-muted">{children}</p>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}
