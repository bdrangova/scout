import type { CommentTarget } from '@review-dash/shared'

/** Where a composer's text is typed: a file card, or a spec, extra or evidence card. */
export type DraftKind = 'file' | 'spec' | 'extra' | 'evidence'

export interface UnsavedDraft {
  kind: DraftKind
  /** The file path, or the artifact item's path. */
  ref: string
}

const SEPARATOR = '::'

/**
 * The key of a composer's draft in the review's draft store. A file's is its plain path (the file
 * card has always used that); the artifact kinds are prefixed so the two never collide.
 */
export function draftKey(target: Pick<CommentTarget, 'kind' | 'ref'>): string {
  const ref = target.ref ?? ''
  return target.kind === 'file' ? ref : `${target.kind}${SEPARATOR}${ref}`
}

function parseDraftKey(key: string): UnsavedDraft {
  for (const kind of ['spec', 'extra', 'evidence'] as const) {
    if (key.startsWith(`${kind}${SEPARATOR}`)) return { kind, ref: key.slice(kind.length + SEPARATOR.length) }
  }
  return { kind: 'file', ref: key }
}

/** The drafts with text typed in them and not added as a comment (whitespace only does not count), in the order they were started. */
export function unsavedDraftsOf(drafts: Readonly<Record<string, string>>): UnsavedDraft[] {
  return Object.entries(drafts)
    .filter(([, text]) => text.trim() !== '')
    .map(([key]) => parseDraftKey(key))
}
