import { COLLAPSE_MAX_BYTES, type PatchLine, type Scope, type TreeFile } from '@scout/shared'
import type { FileDiffContentsLoader, FileDiffLoadedChangedFiles } from '@pierre/diffs/react'
import { apiGet } from '@/lib/api'
import { fileContentsPath } from '@/lib/paths'

/** Both sides of a changed text file, as the contents routes return them. */
export interface FileSides {
  before: string
  after: string
}

/**
 * Whether the hidden lines around a file's hunks can be revealed: a modified text file whose
 * both sides exist and are small enough to serve (`contents` is text only up to the collapse limit).
 * Added and deleted files have nothing hidden; binary and omitted ones have no text contents.
 */
export function canExpandContext(file: TreeFile): boolean {
  if (file.binary || file.omitted || file.status === 'added' || file.status === 'deleted') return false
  return file.sizeBefore !== null && file.sizeAfter !== null && file.sizeBefore <= COLLAPSE_MAX_BYTES && file.sizeAfter <= COLLAPSE_MAX_BYTES
}

/** Fetches both sides of a file (`GET .../files/*path/contents?side=before|after`), from the scope's routes when given. */
export function fetchFileSides(sessionId: string, path: string, scope: Scope | null): Promise<FileSides> {
  return Promise.all([
    apiGet<string>(fileContentsPath(sessionId, path, 'before', scope)),
    apiGet<string>(fileContentsPath(sessionId, path, 'after', scope)),
  ]).then(([before, after]) => ({ before, after }))
}

/** The library's `loadDiffFiles` for a partial patch: both sides named as the diff names them. */
export function contentsLoader(load: () => Promise<FileSides>): FileDiffContentsLoader {
  return async (fileDiff): Promise<FileDiffLoadedChangedFiles> => {
    const { before, after } = await load()
    return {
      oldFile: { name: fileDiff.prevName ?? fileDiff.name, contents: before },
      newFile: { name: fileDiff.name, contents: after },
    }
  }
}

function splitLines(text: string): string[] {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * The patch rows with the unchanged lines the patch left out filled in from the file's two
 * sides, so an anchor on a revealed line counts as "in the diff". The gaps are equal on both
 * sides (nothing changed there), so each filled row is a context row numbered on both.
 */
export function fullFileRows(rows: readonly PatchLine[], sides: FileSides): PatchLine[] {
  const oldLines = splitLines(sides.before)
  const newLines = splitLines(sides.after)
  const out: PatchLine[] = []
  let oldNext = 1
  let newNext = 1
  const fillUntil = (oldUntil: number) => {
    while (oldNext < oldUntil) {
      out.push({ kind: 'context', old: oldNext, new: newNext, text: newLines[newNext - 1] ?? oldLines[oldNext - 1] ?? '' })
      oldNext += 1
      newNext += 1
    }
  }
  for (const row of rows) {
    if (row.old !== null) fillUntil(row.old)
    else if (row.new !== null) fillUntil(oldNext + (row.new - newNext))
    out.push(row)
    if (row.old !== null) oldNext = row.old + 1
    if (row.new !== null) newNext = row.new + 1
  }
  fillUntil(oldLines.length + 1)
  return out
}
