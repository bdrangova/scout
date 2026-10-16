import type { LineAnchor, LineSide } from '../schemas/review.ts'

/** One content line of a unified diff with its number on each side it exists on. */
export interface PatchLine {
  kind: 'context' | 'add' | 'del'
  old: number | null
  new: number | null
  text: string
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * The content lines of one file's patch (`diff --git` header, `---`/`+++` and hunk headers
 * skipped) in display order, numbered from the hunk headers. Tolerant of a patch without
 * headers; `\ No newline at end of file` markers are dropped.
 */
export function parsePatchLines(patch: string): PatchLine[] {
  const lines: PatchLine[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const raw of patch.replaceAll('\r\n', '\n').split('\n')) {
    const hunk = HUNK_RE.exec(raw)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (raw.startsWith('+')) {
      if (raw.startsWith('+++ ')) continue
      lines.push({ kind: 'add', old: null, new: newLine, text: raw.slice(1) })
      newLine += 1
    } else if (raw.startsWith('-')) {
      if (raw.startsWith('--- ')) continue
      lines.push({ kind: 'del', old: oldLine, new: null, text: raw.slice(1) })
      oldLine += 1
    } else if (raw.startsWith(' ') || raw === '') {
      // A bare empty line is a context line whose text is empty (trailing whitespace stripped).
      lines.push({ kind: 'context', old: oldLine, new: newLine, text: raw.slice(1) })
      oldLine += 1
      newLine += 1
    } else if (raw.startsWith('diff ')) {
      inHunk = false
    }
    // `\ No newline at end of file` and `index`/mode lines carry no content.
  }
  // A patch ending with a newline yields one spurious empty context row at the end.
  const last = lines[lines.length - 1]
  if (last && last.kind === 'context' && last.text === '' && patch.endsWith('\n')) lines.pop()
  return lines
}

/**
 * The `diff --git` section of `path` in a concatenated patch (the `.patch` written next to a
 * sent snapshot), or null when the file has none.
 */
export function filePatchFor(patch: string, path: string): string | null {
  const sections = patch.split(/^(?=diff --git )/m)
  for (const section of sections) {
    if (!section.startsWith('diff --git ')) continue
    const header = section.slice(0, section.indexOf('\n'))
    const plus = /^\+\+\+ (?:b\/)?(.+)$/m.exec(section)?.[1]
    const minus = /^--- (?:a\/)?(.+)$/m.exec(section)?.[1]
    const named = plus !== undefined && plus !== '/dev/null' ? plus : minus
    if (named === path || (named === undefined && header.endsWith(` b/${path}`))) return section
  }
  return null
}

function numberOn(line: PatchLine, side: LineSide): number | null {
  return side === 'old' ? line.old : line.new
}

/** Index of the row numbered `line` on `side`, or -1. */
function indexOf(lines: readonly PatchLine[], side: LineSide, line: number): number {
  return lines.findIndex((row) => numberOn(row, side) === line)
}

/** True when the anchored line (and, for a range, its last line) is in this patch. */
export function anchorInPatch(lines: readonly PatchLine[], anchor: LineAnchor): boolean {
  if (indexOf(lines, anchor.side, anchor.line) === -1) return false
  return anchor.endLine === undefined || indexOf(lines, anchor.side, anchor.endLine) !== -1
}

const SIGN: Record<PatchLine['kind'], string> = { context: ' ', add: '+', del: '-' }
const EXCERPT_MAX = 3

/**
 * The diff lines the agent needs to see the anchor without opening the patch: the anchored line
 * with its neighbours (at most one each side), or the first lines of a range (`…` when cut).
 * Each line is `<number> <sign> <text>`; empty when the anchor is not in the patch.
 */
export function anchorExcerpt(lines: readonly PatchLine[], anchor: LineAnchor): string[] {
  const start = indexOf(lines, anchor.side, anchor.line)
  if (start === -1) return []
  let rows: PatchLine[]
  let cut = false
  if (anchor.endLine === undefined || anchor.endLine === anchor.line) {
    rows = lines.slice(Math.max(0, start - 1), start + 2)
  } else {
    const end = indexOf(lines, anchor.side, anchor.endLine)
    const all = lines.slice(start, end === -1 ? undefined : end + 1).filter((row) => numberOn(row, anchor.side) !== null)
    cut = all.length > EXCERPT_MAX
    rows = cut ? all.slice(0, EXCERPT_MAX) : all
  }
  const width = Math.max(...rows.map((row) => String(numberOn(row, anchor.side) ?? '').length))
  const out = rows.map((row) => {
    const number = numberOn(row, anchor.side)
    return `${String(number ?? '').padStart(width)} ${SIGN[row.kind]} ${row.text}`.trimEnd()
  })
  if (cut) out.push('…')
  return out
}
