import type { PrReviewReport, SpecItem } from '@scout/shared'
import { Files, ListChecks, ScrollText } from 'lucide-react'
import { SPEC_KIND, type ItemKind } from '@/components/spec/item-kinds'

/** The Summary page's own cards; spec sources use their path (never starting with `#`). */
export const SUMMARY_ID = '#summary'
export const DESCRIPTION_ID = '#description'
export const FILES_ID = '#files'

export const SUMMARY_KIND: ItemKind = { icon: ListChecks, label: 'Summary' }
export const DESCRIPTION_KIND: ItemKind = { icon: ScrollText, label: 'PR description' }
export const FILES_KIND: ItemKind = { icon: Files, label: 'Changed files' }

export type SummaryCard =
  | { id: typeof SUMMARY_ID | typeof DESCRIPTION_ID | typeof FILES_ID; kind: ItemKind; title: string }
  | { id: string; kind: ItemKind; title: string; spec: SpecItem }

/**
 * The Summary page in order: the summary, the PR description, the tickets (then any other spec source),
 * the changed files. The description is there only when the review skill wrote the overview.
 */
export function summaryCards(report: PrReviewReport | null, spec: readonly SpecItem[]): SummaryCard[] {
  const sources = [...spec.filter((item) => item.type === 'jira'), ...spec.filter((item) => item.type !== 'jira')]
  return [
    { id: SUMMARY_ID, kind: SUMMARY_KIND, title: report?.overview?.title ?? 'Summary' },
    ...(report?.overview ? [{ id: DESCRIPTION_ID, kind: DESCRIPTION_KIND, title: 'Description' } as const] : []),
    ...sources.map((item) => ({ id: item.path, kind: SPEC_KIND[item.type], title: item.title, spec: item })),
    { id: FILES_ID, kind: FILES_KIND, title: 'Changed files' },
  ]
}
