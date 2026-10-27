import type { Journal, JournalEntry } from '@review-dash/shared'
import { SESSION_ID } from './fixtures'

/** A journal entry with defaults (a file-level decision on `src/other.ts`); override what the test is about. */
export function makeEntry(id: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    kind: 'decision',
    title: `Title ${id}`,
    body: `Body of ${id}.`,
    file: 'src/other.ts',
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

export function makeJournal(entries: JournalEntry[]): Journal {
  return { schemaVersion: 2, sessionId: SESSION_ID, updatedAt: '2026-10-26T12:00:00.000Z', nextId: entries.length + 1, entries }
}
