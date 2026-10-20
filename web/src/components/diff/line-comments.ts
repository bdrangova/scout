import { anchorInPatch, anchorKey, type CommentWithStatus, type LineAnchor, type LineSide, type PatchLine } from '@review-dash/shared'
import type { DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs/react'
import { createContext, useContext } from 'react'
import type { PrPlacement, PrThread } from '@/lib/pr-threads'

/** What `FileDiffView` needs to show and edit the line comments of the file it renders. */
export interface LineCommentsValue {
  /** The file's anchored comments (merged with their status). */
  comments: CommentWithStatus[]
  onAdd: (anchor: LineAnchor, body: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}

/** Provided by `FileReviewCard` around the diff; absent (null) where a diff is shown read-only. */
export const LineCommentsContext = createContext<LineCommentsValue | null>(null)

export function useLineComments(): LineCommentsValue | null {
  return useContext(LineCommentsContext)
}

/** What one annotation slot of the diff shows. */
export type LineAnnotationContent =
  | { kind: 'comments'; anchor: LineAnchor; comments: CommentWithStatus[] }
  | { kind: 'draft'; anchor: LineAnchor }
  /** Comments whose line is no longer in the diff, listed above the first line. */
  | { kind: 'orphans'; comments: CommentWithStatus[] }
  /** GitHub PR threads on one line (read-only, under the last line of a range). */
  | { kind: 'pr'; anchor: LineAnchor; threads: PrThread[] }

export type DiffAnnotation = DiffLineAnnotation<LineAnnotationContent>

/** The keyboard cursor over the diff rows: `from` is where it started, `to` where it is (a range when they differ). */
export interface RowCursor {
  from: number
  to: number
}

const LIBRARY_SIDE: Record<LineSide, 'deletions' | 'additions'> = { old: 'deletions', new: 'additions' }
const OUR_SIDE: Record<'deletions' | 'additions', LineSide> = { deletions: 'old', additions: 'new' }

function rowSide(row: PatchLine): LineSide {
  return row.kind === 'del' ? 'old' : 'new'
}

function rowNumber(row: PatchLine): number {
  return (row.kind === 'del' ? row.old : row.new) ?? 0
}

/** The gutter "+" was clicked (or dragged over a range) on these lines. Lines on different sides fall back to the end line. */
export function anchorFromRange(range: SelectedLineRange): LineAnchor {
  const side = OUR_SIDE[range.side ?? 'additions']
  const endSide = OUR_SIDE[range.endSide ?? range.side ?? 'additions']
  if (side !== endSide) return { side: endSide, line: range.end }
  const [line, endLine] = range.start <= range.end ? [range.start, range.end] : [range.end, range.start]
  return line === endLine ? { side, line } : { side, line, endLine }
}

/** The anchor the keyboard cursor stands for; a range only when both ends are on one side. */
export function anchorFromCursor(rows: readonly PatchLine[], cursor: RowCursor): LineAnchor | null {
  const from = rows[cursor.from]
  const to = rows[cursor.to]
  if (!from || !to) return null
  const side = rowSide(to)
  if (rowSide(from) !== side || cursor.from === cursor.to) return { side, line: rowNumber(to) }
  const [line, endLine] = [rowNumber(from), rowNumber(to)].sort((a, b) => a - b) as [number, number]
  return { side, line, endLine }
}

/** The library's highlight for an anchor (the draft's range or the keyboard cursor). */
export function selectionFor(anchor: LineAnchor): SelectedLineRange {
  const side = LIBRARY_SIDE[anchor.side]
  return { start: anchor.line, side, end: anchor.endLine ?? anchor.line, endSide: side }
}

/**
 * One annotation per anchored line (under the last line of a range), the draft box, and the
 * comments whose line left the diff gathered above the first line.
 */
export function buildAnnotations(rows: readonly PatchLine[], comments: readonly CommentWithStatus[], draft: LineAnchor | null): DiffAnnotation[] {
  const groups = new Map<string, { anchor: LineAnchor; comments: CommentWithStatus[] }>()
  const orphans: CommentWithStatus[] = []
  for (const comment of comments) {
    const anchor = comment.target.anchor
    if (anchor === undefined) continue
    if (!anchorInPatch(rows, anchor)) {
      orphans.push(comment)
      continue
    }
    const key = anchorKey(anchor)
    const group = groups.get(key)
    if (group) group.comments.push(comment)
    else groups.set(key, { anchor, comments: [comment] })
  }
  const annotations: DiffAnnotation[] = []
  if (orphans.length > 0) {
    const side = rows.some((row) => row.new !== null) ? 'additions' : 'deletions'
    annotations.push({ side, lineNumber: 0, metadata: { kind: 'orphans', comments: orphans } })
  }
  for (const group of groups.values()) {
    annotations.push({ side: LIBRARY_SIDE[group.anchor.side], lineNumber: group.anchor.endLine ?? group.anchor.line, metadata: { kind: 'comments', ...group } })
  }
  if (draft) annotations.push({ side: LIBRARY_SIDE[draft.side], lineNumber: draft.endLine ?? draft.line, metadata: { kind: 'draft', anchor: draft } })
  return annotations
}

/** One annotation per anchored line for the GitHub threads that sit on it. */
export function buildPrAnnotations(placed: PrPlacement['placed']): DiffAnnotation[] {
  const groups = new Map<string, { anchor: LineAnchor; threads: PrThread[] }>()
  for (const { anchor, thread } of placed) {
    const key = anchorKey(anchor)
    const group = groups.get(key)
    if (group) group.threads.push(thread)
    else groups.set(key, { anchor, threads: [thread] })
  }
  return [...groups.values()].map((group) => ({
    side: LIBRARY_SIDE[group.anchor.side],
    lineNumber: group.anchor.endLine ?? group.anchor.line,
    metadata: { kind: 'pr', ...group },
  }))
}
