import type { Journal, JournalAnchor, JournalEntry } from '../schemas/journal.ts'
import type { LineAnchor } from '../schemas/review.ts'
import { parsePatchLines } from './patch-lines.ts'

export type RelocatedAnchor = { anchor: LineAnchor; stale: false } | { anchor: null; stale: true }

/**
 * Finds where a journal note's line is in the file's current patch: kept when the line at the old
 * number still has the snippet's text, else moved to the nearest same-side line with that text
 * (`endLine` shifts by the same delta), else stale.
 */
export function relocateJournalAnchor(anchor: JournalAnchor, filePatch: string): RelocatedAnchor {
  const { snippet, ...base } = anchor
  const numbered = parsePatchLines(filePatch).flatMap((line) => {
    const number = anchor.side === 'old' ? line.old : line.new
    return number === null ? [] : [{ number, text: line.text.trim() }]
  })
  if (numbered.some((line) => line.number === anchor.line && line.text === snippet)) return { anchor: base, stale: false }
  let best: number | null = null
  for (const line of numbered) {
    if (line.text !== snippet) continue
    if (best === null || Math.abs(line.number - anchor.line) < Math.abs(best - anchor.line)) best = line.number
  }
  if (best === null) return { anchor: null, stale: true }
  const delta = best - anchor.line
  return {
    anchor: { side: anchor.side, line: best, ...(anchor.endLine !== undefined && { endLine: anchor.endLine + delta }) },
    stale: false,
  }
}

/** Entries that were not superseded. */
export function liveEntries(journal: Journal | null): JournalEntry[] {
  return journal === null ? [] : journal.entries.filter((entry) => entry.supersededBy === undefined)
}

/** The file's live `summary`, or null. */
export function fileSummary(journal: Journal | null, path: string): JournalEntry | null {
  return liveEntries(journal).find((entry) => entry.kind === 'summary' && entry.file === path) ?? null
}

/** The file's live entries (summary included), in journal order. */
export function entriesForFile(journal: Journal | null, path: string): JournalEntry[] {
  return liveEntries(journal).filter((entry) => entry.file === path)
}

/** Live line-anchored entry count per file (the file tree's Scout mark); file-level notes don't count. */
export function journalLineNotesByFile(journal: Journal | null): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of liveEntries(journal)) {
    if (entry.file !== null && entry.anchor !== undefined) counts.set(entry.file, (counts.get(entry.file) ?? 0) + 1)
  }
  return counts
}

/** Live entry count (the nav badge). */
export function journalCount(journal: Journal | null): number {
  return liveEntries(journal).length
}

/** The id the next added entry gets: `j<nextId>`. */
export function nextJournalId(journal: Journal | null): string {
  return `j${journal === null ? 1 : journal.nextId}`
}
