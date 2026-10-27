import { describe, expect, it } from 'vitest'
import type { Journal, JournalEntry } from '../schemas/journal.ts'
import { JournalEntrySchema } from '../schemas/journal.ts'
import { SESSION_ID, T0 } from '../testing/fixtures.ts'
import { entriesForFile, fileSummary, journalCount, liveEntries, nextJournalId, relocateJournalAnchor } from './journal-anchor.ts'

const patch = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,3 +10,6 @@',
  ' keep',
  '+  const x = 1',
  '+  doIt()',
  '+  const x = 1',
  '+  more()',
  '-gone',
  ' end',
  '',
].join('\n')
// new numbering: keep=10, x=11, doIt=12, x=13, more=14, end=15; old: keep=1, gone=2, end=3

describe('relocateJournalAnchor', () => {
  it('keeps an exact hit', () => {
    expect(relocateJournalAnchor({ side: 'new', line: 12, snippet: 'doIt()' }, patch)).toEqual({ anchor: { side: 'new', line: 12 }, stale: false })
  })
  it('moves to the shifted line', () => {
    expect(relocateJournalAnchor({ side: 'new', line: 5, snippet: 'doIt()' }, patch)).toEqual({ anchor: { side: 'new', line: 12 }, stale: false })
  })
  it('shifts endLine by the same delta', () => {
    expect(relocateJournalAnchor({ side: 'new', line: 8, endLine: 9, snippet: 'doIt()' }, patch)).toEqual({
      anchor: { side: 'new', line: 12, endLine: 13 },
      stale: false,
    })
  })
  it('picks the nearest of duplicates', () => {
    expect(relocateJournalAnchor({ side: 'new', line: 14, snippet: 'const x = 1' }, patch).anchor?.line).toBe(13)
    expect(relocateJournalAnchor({ side: 'new', line: 2, snippet: 'const x = 1' }, patch).anchor?.line).toBe(11)
  })
  it('uses the old side numbering', () => {
    expect(relocateJournalAnchor({ side: 'old', line: 7, snippet: 'gone' }, patch)).toEqual({ anchor: { side: 'old', line: 2 }, stale: false })
  })
  it('is stale when the text is gone', () => {
    expect(relocateJournalAnchor({ side: 'new', line: 12, snippet: 'missing' }, patch)).toEqual({ anchor: null, stale: true })
    expect(relocateJournalAnchor({ side: 'new', line: 2, snippet: 'gone' }, patch)).toEqual({ anchor: null, stale: true })
  })
})

function entry(overrides: Partial<JournalEntry> & { id: string }): JournalEntry {
  return { kind: 'decision', title: 't', body: 'b', file: 'a.ts', createdAt: T0, updatedAt: null, ...overrides }
}
const journal: Journal = {
  schemaVersion: 2,
  sessionId: SESSION_ID,
  updatedAt: T0,
  nextId: 5,
  entries: [
    entry({ id: 'j1', kind: 'summary', supersededBy: 'j3' }),
    entry({ id: 'j2', anchor: { side: 'new', line: 1, snippet: 'x' } }),
    entry({ id: 'j3', kind: 'summary' }),
    entry({ id: 'j4', file: null }),
  ],
}

describe('journal helpers', () => {
  it('lists live entries only', () => {
    expect(liveEntries(journal).map((e) => e.id)).toEqual(['j2', 'j3', 'j4'])
    expect(liveEntries(null)).toEqual([])
    expect(journalCount(journal)).toBe(3)
    expect(journalCount(null)).toBe(0)
  })
  it('finds the live summary and the file entries', () => {
    expect(fileSummary(journal, 'a.ts')?.id).toBe('j3')
    expect(fileSummary(journal, 'b.ts')).toBeNull()
    expect(entriesForFile(journal, 'a.ts').map((e) => e.id)).toEqual(['j2', 'j3'])
  })
  it('computes the next id', () => {
    expect(nextJournalId(journal)).toBe('j5')
    expect(nextJournalId(null)).toBe('j1')
  })
  it('rejects an anchored summary and an anchor without a file', () => {
    expect(JournalEntrySchema.safeParse(entry({ id: 'j1', kind: 'summary', anchor: { side: 'new', line: 1, snippet: 'x' } })).success).toBe(false)
    expect(JournalEntrySchema.safeParse(entry({ id: 'j1', file: null, anchor: { side: 'new', line: 1, snippet: 'x' } })).success).toBe(false)
    expect(JournalEntrySchema.safeParse(entry({ id: 'j2', anchor: { side: 'new', line: 1, snippet: 'x' } })).success).toBe(true)
  })
})
