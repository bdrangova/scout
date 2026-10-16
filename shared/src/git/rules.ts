// NODE ONLY (see run.ts). Pure decisions about a changed file: collapse and omit.
import { COLLAPSE_CHANGED_LINES, COLLAPSE_GLOBS, COLLAPSE_MAX_BYTES, OMIT_MAX_BYTES } from '../constants.ts'
import type { FileStatus } from '../schemas/tree.ts'

export const OMIT_REASON_TOO_LARGE = 'too-large'
export const COLLAPSE_REASON_LINES = 'too-many-changed-lines'
export const COLLAPSE_REASON_SIZE = 'too-large'
export const COLLAPSE_REASON_GLOB = 'generated-or-vendored'
export const COLLAPSE_REASON_OMITTED = 'omitted'

/** Converts a glob with `**`, `*` and `?` into an anchored RegExp over `/`-separated paths. */
export function globToRegExp(glob: string): RegExp {
  let source = ''
  let i = 0
  while (i < glob.length) {
    const ch = glob.charAt(i)
    if (ch === '*' && glob.charAt(i + 1) === '*') {
      if (glob.charAt(i + 2) === '/') {
        source += '(?:.*/)?'
        i += 3
      } else {
        source += '.*'
        i += 2
      }
      continue
    }
    if (ch === '*') source += '[^/]*'
    else if (ch === '?') source += '[^/]'
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    i += 1
  }
  // `dir/**` also matches `dir` itself; `(?:.*/)?` above already allows the root level.
  source = source.replace(/\/\.\*$/, '(?:/.*)?')
  return new RegExp(`^${source}$`)
}

const COLLAPSE_MATCHERS: readonly RegExp[] = COLLAPSE_GLOBS.map(globToRegExp)

export function matchesCollapseGlob(filePath: string): boolean {
  return COLLAPSE_MATCHERS.some((re) => re.test(filePath))
}

export interface FileFacts {
  path: string
  status: FileStatus
  additions: number
  deletions: number
  binary: boolean
  sizeBefore: number | null
  sizeAfter: number | null
}

export interface FileDecision {
  collapsed: boolean
  collapseReason: string | null
  omitted: boolean
  omitReason: string | null
}

/**
 * - omitted: a text file whose patch would exceed OMIT_MAX_BYTES (approximated by its blob size;
 *   binary patches are one line, so binaries are never omitted); omitted files are also collapsed
 * - collapsed: more than COLLAPSE_CHANGED_LINES changed lines, an after-size above
 *   COLLAPSE_MAX_BYTES, or a path matching COLLAPSE_GLOBS
 */
export function decideFile(facts: FileFacts): FileDecision {
  const { binary, sizeBefore, sizeAfter } = facts
  const largest = Math.max(sizeBefore ?? 0, sizeAfter ?? 0)
  const omitted = !binary && largest > OMIT_MAX_BYTES
  let collapseReason: string | null = null
  if (omitted) collapseReason = COLLAPSE_REASON_OMITTED
  else if (facts.additions + facts.deletions > COLLAPSE_CHANGED_LINES) collapseReason = COLLAPSE_REASON_LINES
  else if ((sizeAfter ?? 0) > COLLAPSE_MAX_BYTES) collapseReason = COLLAPSE_REASON_SIZE
  else if (matchesCollapseGlob(facts.path)) collapseReason = COLLAPSE_REASON_GLOB
  return {
    collapsed: collapseReason !== null,
    collapseReason,
    omitted,
    omitReason: omitted ? OMIT_REASON_TOO_LARGE : null,
  }
}
