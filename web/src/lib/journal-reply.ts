import { relocateJournalAnchor, type CommentTarget, type JournalEntry } from '@review-dash/shared'
import { apiGet } from './api'
import { filePatchPath } from './paths'

/**
 * Where a reply to a note lands: a session-level note gets an overall comment; a file note a file
 * comment, on the note's relocated lines when it is anchored and the line is still in the file's
 * patch (the page has no patch at hand, so it is fetched here), else on the file itself.
 */
export async function replyTargetFor(
  entry: JournalEntry,
  sessionId: string,
  loadPatch: (path: string) => Promise<string> = (path) => apiGet<string>(filePatchPath(sessionId, path)),
): Promise<CommentTarget> {
  if (entry.file === null) return { kind: 'overall', ref: null }
  const fileTarget: CommentTarget = { kind: 'file', ref: entry.file }
  if (!entry.anchor) return fileTarget
  try {
    const relocated = relocateJournalAnchor(entry.anchor, await loadPatch(entry.file))
    return relocated.stale ? fileTarget : { ...fileTarget, anchor: relocated.anchor }
  } catch {
    return fileTarget
  }
}
