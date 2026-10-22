import type { UnsavedDraft } from '@/lib/comment-drafts'
import { encodePath, splitPath } from '@/lib/paths'
import { evidenceRefsOf, isTestRunSection, type SectionDetail } from './open-comments-sections'

export interface DraftLink {
  key: string
  label: string
  /** Where the composer is, relative to the Submit page (use with `relative="path"`). */
  to: string
}

/** One link per composer holding text that was not added: the file card, or the spec, extra or evidence item. */
export function draftLinks(drafts: readonly UnsavedDraft[], detail: SectionDetail): DraftLink[] {
  const code = isTestRunSection(detail) ? null : detail
  return drafts.map(({ kind, ref }) => {
    switch (kind) {
      case 'file':
        return { key: `file:${ref}`, label: splitPath(ref).name, to: `../files/${encodePath(ref)}` }
      case 'evidence':
        return { key: `evidence:${ref}`, label: code?.evidence.find((item) => item.path === ref)?.caption ?? ref, to: `../evidence/${encodePath(ref)}` }
      case 'spec':
        return { key: `spec:${ref}`, label: code?.spec.find((item) => item.path === ref)?.title ?? ref, to: '../spec' }
      case 'scenario':
        return { key: `scenario:${ref}`, label: (isTestRunSection(detail) ? detail.scenarios.find((scenario) => scenario.id === ref)?.title : undefined) ?? ref, to: `../review/${encodePath(ref)}` }
      case 'run-file': {
        const owner = isTestRunSection(detail) ? detail.scenarios.find((scenario) => evidenceRefsOf(scenario).includes(ref)) : undefined
        return { key: `run-file:${ref}`, label: ref.slice(ref.lastIndexOf('/') + 1), to: owner === undefined ? '../review' : `../review/${encodePath(owner.id)}` }
      }
      case 'bug':
        return { key: `bug:${ref}`, label: (isTestRunSection(detail) ? detail.index.bugs?.find((bug) => bug.slug === ref)?.title : undefined) ?? ref, to: '../gaps' }
      case 'log':
        return { key: `log:${ref}`, label: (isTestRunSection(detail) ? detail.index.logs?.find((log) => log.path === ref)?.label : undefined) ?? ref, to: '../logs' }
      case 'extra':
        return { key: `extra:${ref}`, label: code?.extras.find((item) => item.path === ref)?.title ?? ref, to: '../extras' }
    }
  })
}
