import type { EvidenceItem, ExtraItem, SpecItem } from '../schemas/artifacts.ts'
import type { Comment, CommentTargetKind } from '../schemas/review.ts'
import type { SentSnapshot } from '../schemas/sent.ts'
import { formatLineAnchor } from './line-anchor.ts'
import { anchorExcerpt, filePatchFor, parsePatchLines, type PatchLine } from './patch-lines.ts'

const REQUIRED_RESPONSE =
  'Address every open comment by changing the code in the working tree; the dashboard reads it live, there is nothing to publish. ' +
  'For each comment run `ai-review resolve <id> --comment c<n> --status resolved --note "…"` ' +
  '(or `--status open --note "…"` to reply without resolving). ' +
  'The exact diff the reviewer saw is in `<patch>` (relative to the session folder).'

/** What the renderer needs besides the snapshot: the session title, the dashboard origin and the artifacts for display names. */
export interface SentMarkdownContext {
  title: string
  /** e.g. `http://127.0.0.1:4546` */
  dashboardUrl: string
  evidence?: readonly EvidenceItem[]
  extras?: readonly ExtraItem[]
  spec?: readonly SpecItem[]
  /** The full diff at send time (the `.patch` next to the snapshot): line comments quote the lines around their anchor from it. */
  patch?: string
}

function decisionLabel(decision: SentSnapshot['decision']): string {
  return decision.toUpperCase().replaceAll('-', ' ')
}

function formatTimestamp(sec: number): string {
  const whole = Math.floor(sec)
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * `- [c3] at 0:42 > body`, with continuation lines of a multi-line body quoted under the bullet.
 * A line comment reads `- [c3] path:12 > body` (`path:10-14` for a range, `(old)` for the before
 * side), followed by a fenced excerpt of the diff lines around the anchor when the patch is known.
 */
function commentLines(comment: Comment, patchLines: readonly PatchLine[] | null = null): string[] {
  const at = comment.timestampSec === null ? '' : ` at ${formatTimestamp(comment.timestampSec)}`
  const anchor = comment.target.anchor
  const where = anchor === undefined ? '' : ` ${comment.target.ref}:${formatLineAnchor(anchor)}`
  const [first = '', ...rest] = comment.body.replaceAll('\r\n', '\n').trim().split('\n')
  const lines = [`- [${comment.id}]${at}${where} > ${first}`, ...rest.map((line) => (line === '' ? '  >' : `  > ${line}`))]
  if (anchor !== undefined && patchLines !== null) {
    const excerpt = anchorExcerpt(patchLines, anchor)
    if (excerpt.length > 0) lines.push('  ```', ...excerpt.map((line) => `  ${line}`), '  ```')
  }
  return lines
}

function groupByRef(comments: Comment[], kind: Exclude<CommentTargetKind, 'overall'>): Map<string, Comment[]> {
  const groups = new Map<string, Comment[]>()
  for (const comment of comments) {
    if (comment.target.kind !== kind || comment.target.ref === null) continue
    const group = groups.get(comment.target.ref)
    if (group) group.push(comment)
    else groups.set(comment.target.ref, [comment])
  }
  return groups
}

/** Refs in known order first, then any no longer known in first-comment order. */
function orderedRefs(groups: Map<string, Comment[]>, known: readonly string[]): string[] {
  const ordered = known.filter((ref) => groups.has(ref))
  const seen = new Set(ordered)
  for (const ref of groups.keys()) {
    if (!seen.has(ref)) ordered.push(ref)
  }
  return ordered
}

/** The file's lines from the sent patch, parsed only when one of its comments is anchored. */
function patchLinesFor(patch: string | undefined, path: string, comments: readonly Comment[]): PatchLine[] | null {
  if (patch === undefined || !comments.some((comment) => comment.target.anchor !== undefined)) return null
  const section = filePatchFor(patch, path)
  return section === null ? null : parsePatchLines(section)
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function artifactSection(
  heading: string,
  comments: Comment[],
  kind: Exclude<CommentTargetKind, 'overall' | 'file'>,
  items: readonly { path: string; label: string }[],
): string | null {
  const groups = groupByRef(comments, kind)
  if (groups.size === 0) return null
  const lines = [heading]
  for (const ref of orderedRefs(groups, items.map((item) => item.path))) {
    const label = items.find((item) => item.path === ref)?.label
    lines.push(label === undefined || label === ref ? `### ${ref}` : `### ${ref} — ${label}`)
    for (const comment of groups.get(ref) ?? []) lines.push(...commentLines(comment))
  }
  return lines.join('\n')
}

/**
 * Renders a sent snapshot to the markdown the agent reads (`review/sent/<stem>.md`, and
 * `ai-review feedback`). Artifacts are named by their path (the comment ref) with the caption or
 * title after a dash. Deterministic: `\n` line endings, one trailing newline, empty sections omitted.
 */
export function renderSentMarkdown(sent: SentSnapshot, ctx: SentMarkdownContext): string {
  const sections: string[] = []

  sections.push(
    [
      `# Review feedback — ${ctx.title} (${sent.sessionId})`,
      `Sent: ${sent.sentAt} · Decision: **${decisionLabel(sent.decision)}** · Dashboard: ${trimTrailingSlash(ctx.dashboardUrl)}/s/${sent.sessionId}`,
      `Tree: ${sent.tree.branch ?? 'detached'} @ ${sent.tree.headSha.slice(0, 12)} (base ${sent.tree.baseSha.slice(0, 12)}) · Diff: \`${sent.patchPath}\``,
    ].join('\n'),
  )

  const overall = sent.comments.filter((comment) => comment.target.kind === 'overall')
  if (overall.length > 0) {
    sections.push(['## Overall', ...overall.flatMap((comment) => commentLines(comment))].join('\n'))
  }

  const fileComments = groupByRef(sent.comments, 'file')
  const verdicts = new Map(sent.files.map((file) => [file.path, file.verdict]))
  const rejected = sent.files.filter((file) => file.verdict === 'rejected').map((file) => file.path)
  const commented = orderedRefs(fileComments, []).filter((path) => !verdicts.has(path))
  const approved = sent.files
    .filter((file) => file.verdict === 'approved' && fileComments.has(file.path))
    .map((file) => file.path)
  const listedFiles: { path: string; label: string }[] = [
    ...rejected.map((path) => ({ path, label: 'REJECTED' })),
    ...commented.map((path) => ({ path, label: 'commented' })),
    ...approved.map((path) => ({ path, label: 'approved' })),
  ]
  if (listedFiles.length > 0) {
    const { counts } = sent
    const lines = [
      `## Files (${counts.rejected} rejected, ${counts.approved} approved, ${counts.commented} commented, ${counts.unreviewed} not reviewed)`,
    ]
    for (const { path, label } of listedFiles) {
      lines.push(`### ${path} — ${label}`)
      const comments = fileComments.get(path) ?? []
      const patchLines = patchLinesFor(ctx.patch, path, comments)
      for (const comment of comments) lines.push(...commentLines(comment, patchLines))
    }
    sections.push(lines.join('\n'))
  }

  const evidence = artifactSection('## Evidence', sent.comments, 'evidence', (ctx.evidence ?? []).map((item) => ({ path: item.path, label: item.caption })))
  if (evidence !== null) sections.push(evidence)
  const spec = artifactSection('## Spec', sent.comments, 'spec', (ctx.spec ?? []).map((item) => ({ path: item.path, label: item.title })))
  if (spec !== null) sections.push(spec)
  const extras = artifactSection('## Extras', sent.comments, 'extra', (ctx.extras ?? []).map((item) => ({ path: item.path, label: item.title })))
  if (extras !== null) sections.push(extras)

  sections.push(
    ['## Required response', REQUIRED_RESPONSE.replaceAll('<id>', sent.sessionId).replaceAll('<patch>', sent.patchPath)].join('\n'),
  )

  return `${sections.join('\n\n')}\n`
}
