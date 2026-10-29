import { anchorLabel, type PrCommentView } from '@scout/shared'
import { pluralize } from '@/lib/format'
import type { PrFileCounts } from '@/lib/pr-threads'

const LONG_CHARS = 360
const LONG_LINES = 7

/** A body long enough to be cut to a few lines behind "Show more". */
export function isLongBody(body: string): boolean {
  return body.length > LONG_CHARS || body.split('\n').length > LONG_LINES
}

/** A folded comment's one-line preview: the body's text without markup, tags or line breaks. */
export function bodyExcerpt(body: string): string {
  return body
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Where the comment sits when it has no current line: the line it was written on, or "file comment". */
export function prLocationLabel(view: PrCommentView): string | null {
  if (view.anchor) return anchorLabel(view.anchor)
  if (view.kind !== 'line') return null
  return view.originalLine === null ? 'file comment' : `line ${view.originalLine} (when written)`
}

/** The accessible and title text: "3 PR comments, 1 open". */
export function prCountText({ total, open }: PrFileCounts): string {
  return open > 0 ? `${pluralize(total, 'PR comment')}, ${open} open` : pluralize(total, 'PR comment')
}
