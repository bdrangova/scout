import type { UnsavedDraft } from '@/lib/comment-drafts'
import { encodePath, splitPath } from '@/lib/paths'
import type { SectionDetail } from './open-comments-sections'

export interface DraftLink {
  key: string
  label: string
  /** Where the composer is, relative to the Submit page (use with `relative="path"`). */
  to: string
}

/** One link per composer holding text that was not added: the file card, or the spec, extra or evidence item. */
export function draftLinks(drafts: readonly UnsavedDraft[], detail: SectionDetail): DraftLink[] {
  return drafts.map(({ kind, ref }) => {
    switch (kind) {
      case 'file':
        return { key: `file:${ref}`, label: splitPath(ref).name, to: `../files/${encodePath(ref)}` }
      case 'evidence':
        return { key: `evidence:${ref}`, label: detail.evidence.find((item) => item.path === ref)?.caption ?? ref, to: `../evidence/${encodePath(ref)}` }
      case 'spec':
        return { key: `spec:${ref}`, label: detail.spec.find((item) => item.path === ref)?.title ?? ref, to: '../spec' }
      case 'extra':
        return { key: `extra:${ref}`, label: detail.extras.find((item) => item.path === ref)?.title ?? ref, to: '../extras' }
    }
  })
}
