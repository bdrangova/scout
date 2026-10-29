import { describe, expect, it } from 'vitest'
import { sessionSummary } from '@/test/fixtures'
import { STATUS_FILTERS, countByFilter, statusFilterOf, statusPill } from './session-status'

const progress = { reviewed: 3, total: 3 }

describe('statusPill', () => {
  it('says "Ready to submit" and "Approved" in their tones', () => {
    expect(statusPill({ status: 'ready', progress, openComments: 0 })).toEqual({ label: 'Ready to submit', dot: 'ok' })
    expect(statusPill({ status: 'approved', progress, openComments: 0 }).label).toBe('Approved')
  })

  it('says "Nothing to review" for a session without files', () => {
    expect(statusPill({ status: 'unreviewed', progress: { reviewed: 0, total: 0 }, openComments: 0 }).label).toBe('Nothing to review')
  })

  it('names "Updated since sent" with its open comments', () => {
    expect(statusPill({ status: 'updated', progress, openComments: 2 }).label).toBe('Updated since sent · 2 open comments')
  })
})

describe('"Changes sent" wording', () => {
  it('names the decision that was sent, never plain "Sent"', () => {
    const lastSend = { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' as const }
    expect(statusPill({ status: 'sent', progress, openComments: 0, lastSend }).label).toBe('Changes sent · Request changes')
    expect(statusPill({ status: 'sent', progress, openComments: 0, lastSend: { ...lastSend, decision: 'reject' } }).label).toBe('Changes sent · Reject')
    expect(statusPill({ status: 'sent', progress, openComments: 0 }).label).toBe('Changes sent')
  })

  it('does not call a sent Approve "Changes sent · Approve" when files are no longer all approved', () => {
    const lastSend = { at: '2026-10-01T10:00:00.000Z', decision: 'approve' as const }
    expect(statusPill({ status: 'sent', progress, openComments: 0, lastSend }).label).toBe('Changes sent · Approve, not all files approved')
  })

  it('counts a session whose files are all reviewed but nothing is sent under Ready, not Approved', () => {
    expect(STATUS_FILTERS.map((f) => f.label)).toEqual(['All', 'Awaiting review', 'In progress', 'Ready to submit', 'Changes sent', 'Updated since sent', 'Approved', 'Archived'])
  })
})

describe('statusFilterOf', () => {
  it('gives Ready to submit its own filter', () => {
    expect(statusFilterOf('ready')).toBe('ready')
    expect(statusFilterOf('sent')).toBe('sent')
  })
})

describe('countByFilter', () => {
  it('files a sent session under Changes sent and an unsent finished one under Ready', () => {
    const sent = { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' as const }
    const item = sessionSummary({ id: 'a', title: 'a', status: 'sent', progress, lastSend: sent })
    expect(countByFilter([item]).sent).toBe(1)
    expect(countByFilter([sessionSummary({ id: 'b', title: 'b', status: 'ready', progress })]).ready).toBe(1)
  })
})
