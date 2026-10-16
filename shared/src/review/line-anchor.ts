import type { LineAnchor } from '../schemas/review.ts'

/** `new:12` or `old:3-5`: one key per anchored line or range, for grouping comments. */
export function anchorKey(anchor: LineAnchor): string {
  return `${anchor.side}:${anchor.line}${anchor.endLine === undefined ? '' : `-${anchor.endLine}`}`
}

/** `12`, `10-14`, `12 (old)`: the suffix of `path:LINE` in the feedback the agent reads. */
export function formatLineAnchor(anchor: LineAnchor): string {
  const range = anchor.endLine === undefined || anchor.endLine === anchor.line ? `${anchor.line}` : `${anchor.line}-${anchor.endLine}`
  return anchor.side === 'old' ? `${range} (old)` : range
}

/** `line 12`, `lines 10–14`, `old line 12`: the UI label of an anchored comment. */
export function anchorLabel(anchor: LineAnchor): string {
  const range = anchor.endLine === undefined || anchor.endLine === anchor.line ? `line ${anchor.line}` : `lines ${anchor.line}–${anchor.endLine}`
  return anchor.side === 'old' ? `old ${range}` : range
}
