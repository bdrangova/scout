import type { LineSide } from '../schemas/review.ts'
import { parsePatchLines } from './patch-lines.ts'

/** One matching line: the side and number it has in the diff (`new` unless only the old side has it). */
export interface SearchHit {
  side: LineSide
  line: number
  kind: 'context' | 'add' | 'del'
  text: string
}

export interface SearchFileHits {
  path: string
  hits: SearchHit[]
  /** More hits than `hits` holds. */
  truncated: boolean
}

export interface SearchResponse {
  query: string
  /** `diff` searched the changed files' patches; `repo` every tracked file at the working tree. */
  scope: 'diff' | 'repo'
  files: SearchFileHits[]
  /** Stopped at the overall cap. */
  truncated: boolean
}

export const SEARCH_MAX_PER_FILE = 50
export const SEARCH_MAX_TOTAL = 500

/** Case-insensitive substring hits in one file's patch lines. */
export function searchPatch(path: string, patch: string, query: string, limit = SEARCH_MAX_PER_FILE): SearchFileHits | null {
  const needle = query.toLowerCase()
  const hits: SearchHit[] = []
  let truncated = false
  for (const row of parsePatchLines(patch)) {
    if (!row.text.toLowerCase().includes(needle)) continue
    if (hits.length === limit) { truncated = true; break }
    hits.push(row.new !== null ? { side: 'new', line: row.new, kind: row.kind, text: row.text } : { side: 'old', line: row.old!, kind: row.kind, text: row.text })
  }
  return hits.length > 0 ? { path, hits, truncated } : null
}
