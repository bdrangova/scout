import { SECTIONS, TEST_SECTIONS, type SessionDetail } from '@review-dash/shared'
import { createContext, useContext } from 'react'
import { isTestRunDetail } from '@/lib/detail-kind'
import { basePathOf, type SessionKind } from '@/lib/paths'

/**
 * What differs between a code review and a test run in the shared session shell (bar tabs, rail,
 * hotkeys, live updates): the route prefix, the sections and how they are named and counted.
 */
export interface ShellConfig {
  kind: SessionKind
  basePath: '/s' | '/t'
  /** Every section of the kind, in tab order (the `1-n` hotkey order, among the visible ones). */
  sections: readonly string[]
  sectionLabel: (section: string) => string
  /** The count the tab shows; undefined shows none (Files always shows its count, the others when > 0). */
  sectionCount?: (section: string, detail: SessionDetail) => number | undefined
  /** Sections with a tab for this session (optional pages of a test run are absent when the index does not list them). Defaults to `sections`. */
  visibleSections?: (detail: SessionDetail) => readonly string[]
  hotkeys: {
    /** `S` / `G` switch between swipe, scroll and grid: the Files page of a code review, the Review, Gaps, Logs and Data setup pages of a test run (swipe and grid). */
    modes: boolean
  }
}

const CODE_REVIEW_LABELS: Record<(typeof SECTIONS)[number], string> = { spec: 'Spec', extras: 'Extras', evidence: 'Evidence', files: 'Files', submit: 'Submit' }

export const CODE_REVIEW_SHELL: ShellConfig = {
  kind: 'code-review',
  basePath: basePathOf('code-review'),
  sections: SECTIONS,
  sectionLabel: (section) => CODE_REVIEW_LABELS[section as keyof typeof CODE_REVIEW_LABELS] ?? section,
  sectionCount: (section, detail) => {
    if (isTestRunDetail(detail)) return undefined
    switch (section) {
      case 'spec':
        return detail.spec.length
      case 'extras':
        return detail.extras.length
      case 'evidence':
        return detail.evidence.length
      case 'files':
        return detail.tree.files.length
      default:
        return undefined
    }
  },
  hotkeys: { modes: true },
}

const TEST_RUN_LABELS: Record<(typeof TEST_SECTIONS)[number], string> = {
  overview: 'Overview',
  review: 'Review',
  gaps: 'Gaps & bugs',
  'data-setup': 'Data setup',
  logs: 'Logs',
  submit: 'Submit',
}

/** The optional pages are tabs only when the index lists them in `pages`. */
const OPTIONAL_PAGE: Partial<Record<(typeof TEST_SECTIONS)[number], 'gaps' | 'data-setup' | 'logs'>> = { gaps: 'gaps', 'data-setup': 'data-setup', logs: 'logs' }

export const TEST_RUN_SHELL: ShellConfig = {
  kind: 'test-run',
  basePath: basePathOf('test-run'),
  sections: TEST_SECTIONS,
  sectionLabel: (section) => TEST_RUN_LABELS[section as keyof typeof TEST_RUN_LABELS] ?? section,
  sectionCount: (section, detail) => {
    if (!isTestRunDetail(detail)) return undefined
    switch (section) {
      case 'review':
        return detail.scenarios.length
      case 'gaps':
        return (detail.index.gaps?.length ?? 0) + (detail.index.bugs?.length ?? 0)
      case 'logs':
        return detail.index.logs?.length ?? 0
      default:
        return undefined
    }
  },
  visibleSections: (detail) => {
    if (!isTestRunDetail(detail)) return TEST_SECTIONS
    const pages: readonly string[] = detail.index.pages
    return TEST_SECTIONS.filter((section) => {
      const page = OPTIONAL_PAGE[section]
      return page === undefined || pages.includes(page)
    })
  },
  hotkeys: { modes: true },
}

export const PR_REVIEW_SHELL: ShellConfig = {
  ...CODE_REVIEW_SHELL, kind: 'pr-review', sections: ['files', 'submit'],
  sectionLabel: (section) => section === 'files' ? 'Review' : CODE_REVIEW_SHELL.sectionLabel(section),
}

export const SHELL_CONFIGS: Record<SessionKind, ShellConfig> = { 'code-review': CODE_REVIEW_SHELL, 'test-run': TEST_RUN_SHELL, 'pr-review': PR_REVIEW_SHELL }

/** Code review unless a `ShellConfigProvider` says otherwise (so widgets render standalone in tests). */
export const ShellConfigContext = createContext<ShellConfig>(CODE_REVIEW_SHELL)

export function useShellConfig(): ShellConfig {
  return useContext(ShellConfigContext)
}

/** The sections with a tab for this session, in order. */
export function visibleSectionsOf(config: ShellConfig, detail: SessionDetail): readonly string[] {
  return config.visibleSections ? config.visibleSections(detail) : config.sections
}
