import { sha256Hex, type LineAnchor } from '@review-dash/shared'

/** GitHub Files changed anchors use SHA-256 of the exact path; L/R identify old/new diff sides. */
export function prReviewLocationUrl(prUrl: string, path: string | null, anchor?: LineAnchor): string {
  const url = new URL(prUrl)
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/$/, '')
  if (!path) return url.toString()
  url.pathname += '/files'
  const side = anchor?.side === 'old' ? 'L' : 'R'
  const range = anchor ? `${side}${anchor.line}${anchor.endLine && anchor.endLine !== anchor.line ? `-${side}${anchor.endLine}` : ''}` : ''
  url.hash = `diff-${sha256Hex(path)}${range}`
  return url.toString()
}
