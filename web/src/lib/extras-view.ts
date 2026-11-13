import type { SessionDetail } from '@scout/shared'
import { isTestRunDetail } from '@/lib/detail-kind'

/** The Extras page's `?tab=` value that shows Scout's journal (absent: the extras). */
export const TAB_PARAM = 'tab'

export type ExtrasView = 'extras' | 'journal'

/** The live journal notes of a code review (0 for a test run, which has no journal). */
export function journalNotes(detail: SessionDetail): number {
  return isTestRunDetail(detail) ? 0 : detail.journalCount
}

/**
 * Which view the Extras page shows: the journal when `?tab=journal` asks for it (and there is one), the extras when `?tab=extras` does,
 * otherwise the extras, unless there are none and there is a journal.
 */
export function extrasViewOf(detail: SessionDetail, tab: string | null): ExtrasView {
  const notes = journalNotes(detail)
  if (notes === 0) return 'extras'
  if (tab === 'journal') return 'journal'
  if (tab === 'extras') return 'extras'
  const extras = isTestRunDetail(detail) ? 0 : detail.extras.length
  return extras === 0 ? 'journal' : 'extras'
}

/** The search string that shows `view`, keeping the other params; the journal has no `mode`. */
export function extrasViewSearch(params: URLSearchParams, view: ExtrasView, detail: SessionDetail): string {
  const next = new URLSearchParams(params)
  if (view === 'journal') {
    next.delete('mode')
    next.set(TAB_PARAM, 'journal')
  } else if (extrasViewOf(detail, null) === 'journal') {
    // With no extras the bare route is the journal, so the extras need to be asked for.
    next.set(TAB_PARAM, 'extras')
  } else {
    next.delete(TAB_PARAM)
  }
  const text = next.toString()
  return text === '' ? '' : `?${text}`
}
