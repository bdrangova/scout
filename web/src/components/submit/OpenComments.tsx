import { effectiveVerdict, type CommentWithStatus, type Review, type SessionDetail } from '@review-dash/shared'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CommentList } from '@/components/common/CommentList'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import { encodePath, splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { fileChip, formatVerdictSummary, verdictSummary, type FileChip } from './verdict-summary'

export interface OpenCommentsProps {
  comments: CommentWithStatus[]
  review: Review
  /** The live tree and the artifact lists, for labels, verdict chips and links. */
  detail: Pick<SessionDetail, 'tree' | 'evidence' | 'extras' | 'spec'>
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  /** `Open comments` on the compose page, `Comments` next to a run. */
  title?: string
  className?: string
}

interface TargetGroup {
  key: string
  label: string
  /** Where the comment was made (the file, the evidence item, the extra, the spec item). */
  to: string
  chip: FileChip | null
  comments: CommentWithStatus[]
}

interface Section {
  key: 'overall' | 'files' | 'evidence' | 'extras' | 'spec'
  heading: string
  summary: string | null
  groups: TargetGroup[]
}

function byTarget(comments: CommentWithStatus[], kind: CommentWithStatus['target']['kind']): Map<string, CommentWithStatus[]> {
  const map = new Map<string, CommentWithStatus[]>()
  for (const comment of comments) {
    if (comment.target.kind !== kind) continue
    const ref = comment.target.ref ?? ''
    const list = map.get(ref) ?? []
    list.push(comment)
    map.set(ref, list)
  }
  return map
}

function sections(comments: CommentWithStatus[], review: Review, detail: OpenCommentsProps['detail']): Section[] {
  // Open overall comments are edited in the Overall feedback box; only resolved ones are listed here.
  const overall = comments.filter((comment) => comment.target.kind === 'overall' && comment.status === 'resolved')
  const files = byTarget(comments, 'file')
  const evidence = byTarget(comments, 'evidence')
  const extras = byTarget(comments, 'extra')
  const spec = byTarget(comments, 'spec')

  const fileGroups: TargetGroup[] = []
  const known = new Set<string>()
  for (const file of detail.tree.files) {
    const list = files.get(file.path)
    if (!list) continue
    known.add(file.path)
    fileGroups.push({
      key: file.path,
      label: splitPath(file.path).name,
      to: `../files/${encodePath(file.path)}`,
      chip: fileChip(effectiveVerdict(review.files[file.path], file), list),
      comments: list,
    })
  }
  // Comments on files that have since left the working tree keep their place, without a link to a card.
  for (const [path, list] of files) {
    if (known.has(path)) continue
    fileGroups.push({ key: path, label: path, to: '../files', chip: fileChip('none', list), comments: list })
  }

  const evidenceGroups: TargetGroup[] = [...evidence].map(([path, list]) => ({
    key: path,
    label: detail.evidence.find((item) => item.path === path)?.caption ?? path,
    to: `../evidence/${encodePath(path)}`,
    chip: null,
    comments: list,
  }))
  const extraGroups: TargetGroup[] = [...extras].map(([path, list]) => ({
    key: path,
    label: detail.extras.find((item) => item.path === path)?.title ?? path,
    to: '../extras',
    chip: null,
    comments: list,
  }))
  const specGroups: TargetGroup[] = [...spec].map(([path, list]) => ({
    key: path,
    label: detail.spec.find((item) => item.path === path)?.title ?? path,
    to: '../spec',
    chip: null,
    comments: list,
  }))

  return [
    { key: 'overall', heading: 'Overall', summary: null, groups: overall.length ? [{ key: 'overall', label: 'Overall feedback', to: '.', chip: null, comments: overall }] : [] },
    { key: 'files', heading: 'Files', summary: formatVerdictSummary(verdictSummary(review, detail.tree)), groups: fileGroups },
    { key: 'evidence', heading: 'Evidence', summary: null, groups: evidenceGroups },
    { key: 'spec', heading: 'Spec', summary: null, groups: specGroups },
    { key: 'extras', heading: 'Extras', summary: null, groups: extraGroups },
  ]
}

const CHIP_CLASS: Record<FileChip, string> = {
  approved: 'bg-approve/10 text-approve',
  rejected: 'bg-reject/10 text-reject',
  commented: 'bg-muted text-muted-foreground',
}

/**
 * The comments grouped under Files (with the verdict chip per file and a one-line verdict
 * summary), Evidence (caption, `at 0:42` chips), Spec and Extras (title). Resolved comments stay
 * hidden until "Show n resolved"; each shows the agent's note and can be reopened.
 */
export function OpenComments({
  comments,
  review,
  detail,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  title = 'Open comments',
  className,
}: OpenCommentsProps) {
  const [showResolved, setShowResolved] = useState(false)
  const open = comments.filter((comment) => comment.status === 'open')
  const resolvedCount = comments.length - open.length
  const visible = showResolved ? comments : open
  const groups = useMemo(() => sections(visible, review, detail), [visible, review, detail])
  const nonEmpty = groups.filter((section) => section.groups.length > 0)

  return (
    <section aria-label={title} className={cn('flex flex-col rounded-xl bg-card ring-1 ring-foreground/10', className)}>
      <header className="flex items-center gap-2.5 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-warn/15 px-2 py-px text-[11px] font-semibold text-warn-foreground">
          {open.length} open
        </span>
        {resolvedCount > 0 && (
          <span className="rounded-full bg-approve/10 px-2 py-px text-[11px] font-semibold text-approve">
            {resolvedCount} resolved
          </span>
        )}
      </header>
      <div className="flex flex-col gap-1 px-4 pt-1 pb-3 text-[13px]">
        {nonEmpty.length === 0 && (
          <p className="py-3 text-[13px] text-muted-foreground">
            {comments.length === 0 ? 'No comments yet. Reject or comment on a file and it shows up here.' : 'Every comment is resolved.'}
          </p>
        )}
        {nonEmpty.map((section) => (
          <div key={section.key} className="flex flex-col">
            <h4 className="pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{section.heading}</h4>
            {section.summary && <p className="border-b pb-2 text-xs text-muted-foreground">{section.summary}</p>}
            {section.groups.map((group) => (
              <TargetBlock
                key={group.key}
                group={group}
                onEdit={onEdit}
                onDelete={onDelete}
                onResolve={onResolve}
                onReopen={onReopen}
              />
            ))}
          </div>
        ))}
        {resolvedCount > 0 && (
          <button
            type="button"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((value) => !value)}
            className="mt-2 self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
          </button>
        )}
      </div>
    </section>
  )
}

interface TargetBlockProps {
  group: TargetGroup
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}

function TargetBlock({ group, onEdit, onDelete, onResolve, onReopen }: TargetBlockProps) {
  const open = group.comments.filter((comment) => comment.status === 'open')
  const resolved = group.comments.filter((comment) => comment.status === 'resolved')
  return (
    <div className="flex flex-col gap-2 border-b py-2.5 last:border-b-0" aria-label={group.label}>
      <div className="flex items-center gap-2">
        <Link to={group.to} relative="path" className="font-mono text-xs hover:underline">
          {group.label}
        </Link>
        {group.chip && (
          <span className={cn('rounded-full px-2 py-px text-[11px] font-semibold', CHIP_CLASS[group.chip])}>{group.chip}</span>
        )}
      </div>
      {open.length > 0 && (
        <CommentList comments={open} onEdit={onEdit} onDelete={onDelete} onResolve={onResolve} onReopen={onReopen} />
      )}
      {resolved.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={`Resolved comments on ${group.label}`}>
          {resolved.map((comment) => (
            <ResolvedRow key={comment.id} comment={comment} onReopen={onReopen} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ResolvedRow({ comment, onReopen }: { comment: CommentWithStatus; onReopen: (id: string) => void }) {
  const note = comment.resolution?.note ?? null
  const byAgent = comment.resolution?.status === 'resolved'
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground"
      aria-label={`Resolved comment ${comment.id}`}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-mono">{comment.id}</span>
        {comment.timestampSec !== null && <span className="font-mono text-info">at {formatDuration(comment.timestampSec)}</span>}
        <span className="rounded-full bg-approve/10 px-1.5 py-px font-semibold text-approve">resolved</span>
        <time dateTime={comment.resolution?.at ?? comment.createdAt} className="ml-auto">
          {formatRelativeTime(comment.resolution?.at ?? comment.resolvedAt ?? comment.createdAt)}
        </time>
      </div>
      <p className="whitespace-pre-wrap text-foreground/80">{comment.body}</p>
      {note && (
        <p className="flex gap-1.5 text-xs">
          <span className="font-semibold text-approve">{byAgent ? 'Claude Code:' : 'Note:'}</span>
          <span>{note}</span>
        </p>
      )}
      <button
        type="button"
        className="self-end text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onReopen(comment.id)}
      >
        Reopen
      </button>
    </li>
  )
}
