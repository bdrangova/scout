import type { Scope, TreeFile } from '@review-dash/shared'
import { Check, FileX, Image as ImageIcon, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { collapseReason, omitReason } from '@/lib/file-status'
import { formatAdditions, formatBytes, formatDeletions, formatNumber, pluralize } from '@/lib/format'
import { useFilePatch } from '@/lib/hooks'
import { fileContentsUrl, isImagePath } from '@/lib/paths'
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
    <Button variant="outline" size="sm" onClick={onApprove}>
      <Check data-icon="inline-start" aria-hidden />
      Approve without viewing
    </Button>
  )

  if (file.omitted || isOmitted) {
    return (
      <Notice icon={<FileX className="size-5" aria-hidden />} title="Diff omitted" action={approve}>
        <Stats file={file} />
        {' · '}
        {omitReason(file)}
      </Notice>
    )
  }

  if (file.binary) return <BinaryView file={file} sessionId={sessionId} scope={scope} />

  if (gated || isLarge) {
    return (
      <Notice
        icon={<TriangleAlert className="size-5" aria-hidden />}
        title="Collapsed by default"
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setForce(true)}>
              Show diff anyway
            </Button>
            {approve}
          </>
        }
      >
        <Stats file={file} />
        {file.sizeAfter !== null ? ` · ${formatBytes(file.sizeAfter)}` : ''}
        {` · ${collapseReason(file)}; rendering it may be slow.`}
      </Notice>
    )
  }

  if (error) {
    return (
      <Notice
        icon={<TriangleAlert className="size-5" aria-hidden />}
        title="Couldn't load this diff"
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            Retry
          </Button>
        }
      >
        {error.message}
      </Notice>
    )
  }

  if (loading || patch === null) {
    return (
      <p className="px-6 py-8 text-sm text-muted-foreground" aria-busy="true">
        Loading diff…
      </p>
    )
  }

  if (patch.trim() === '') {
    return <Notice title="No textual changes">The file's contents did not change.</Notice>
  }

  return <FileDiffView patch={patch} diffStyle={diffStyle} loadSides={loadSides} />
}

/** `+2,400 −1,800 · 4,200 changed lines` */
function Stats({ file }: { file: TreeFile }) {
  return (
    <>
      <span className="font-semibold text-approve tabular-nums">{formatAdditions(file.additions)}</span>{' '}
      <span className="font-semibold text-reject tabular-nums">{formatDeletions(file.deletions)}</span>
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
      <Notice icon={<ImageIcon className="size-5" aria-hidden />} title="Binary file" inline>
        {file.sizeAfter !== null ? formatBytes(file.sizeAfter) : 'No text diff'}
        {formatNumber(file.additions + file.deletions) !== '0' && ` · ${pluralize(file.additions + file.deletions, 'changed line')}`}
      </Notice>
      {image && sides.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sides.map(({ side }) => (
            <figure key={side} className="flex flex-col gap-2">
              <figcaption className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {side}
              </figcaption>
              <img
                // The fingerprint busts the browser cache when the file changes on disk.
                src={`${fileContentsUrl(sessionId, file.path, side, scope)}&v=${file.fingerprint}`}
                alt={`${file.path} (${side})`}
                className="max-h-[60vh] w-auto max-w-full rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] object-contain"
              />
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

export interface NoticeProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
  inline?: boolean
}

/** A titled note for the card body: an optional icon, a muted line and action buttons. */
export function Notice({ title, icon, action, children, inline = false }: NoticeProps) {
  return (
    <div className={inline ? 'flex items-start gap-3' : 'flex items-start gap-3 px-6 py-8'}>
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <p className="text-sm text-muted-foreground">{children}</p>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}
