import { anchorLabel, type JournalEntry, type JournalKind } from '@scout/shared'
import type { TagProps } from '@/components/ui/tag'

/** A note a comment replies to: the id the comment's `about` carries and the title the chip quotes. */
export interface JournalReply {
  id: string
  title: string
}

export const KIND_LABEL: Record<JournalKind, string> = {
  summary: 'Summary',
  decision: 'Decision',
  implementation: 'Implementation',
  tradeoff: 'Trade-off',
  caveat: 'Caveat',
}

export const KIND_TONE: Record<JournalKind, NonNullable<TagProps['tone']>> = {
  summary: 'sunken',
  decision: 'blue',
  implementation: 'mint',
  tradeoff: 'yellow',
  caveat: 'coral',
}

export const KINDS: readonly JournalKind[] = ['summary', 'decision', 'implementation', 'tradeoff', 'caveat']

export function replyOf(entry: JournalEntry): JournalReply {
  return { id: entry.id, title: entry.title }
}

/** `line 12`, `lines 12–18` (`old line 12` on the old side), or null for a note with no anchor. */
export function entryAnchorLabel(entry: JournalEntry): string | null {
  return entry.anchor ? anchorLabel(entry.anchor) : null
}

/** `YYYY-MM-DD` in the viewer's time zone; `''` for an undated entry. */
export function dayKey(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `Mon 27 Oct 2026` for a `dayKey`; `Undated` for ''. */
export function dayHeading(key: string): string {
  if (key === '') return 'Undated'
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
