import { describe, expect, it } from 'vitest'
import { sessionSummary } from '@/test/fixtures'
import { STATUS_FILTERS, countByFilter, reviewStatusOf, runChipFor, runChipOf, statusFilterOf, statusPill } from './session-status'

const progress = { reviewed: 3, total: 3 }

describe('statusPill', () => {
  it('says "Ready to submit" and "Run failed" in their tones', () => {
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
  it('gives Ready to submit its own filter and groups a failed run with Changes sent', () => {
    expect(statusFilterOf('ready')).toBe('ready')
    expect(statusFilterOf('run-failed')).toBe('sent')
  })
})

describe('run chips', () => {
  const sent = { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' as const }

  it('turns a run state into a chip and keeps the review status underneath', () => {
    expect(runChipOf('agent-working')).toBe('working')
    expect(runChipOf('run-failed')).toBe('failed')
    expect(runChipOf('sent')).toBeNull()
    expect(reviewStatusOf({ status: 'agent-working', progress, openComments: 0, lastSend: sent })).toBe('sent')
    expect(reviewStatusOf({ status: 'run-failed', progress, openComments: 0, lastSend: { ...sent, decision: 'reject' } })).toBe('sent')
    expect(reviewStatusOf({ status: 'agent-working', progress, openComments: 0, lastSend: { ...sent, decision: 'approve' } })).toBe('approved')
    expect(reviewStatusOf({ status: 'run-failed', progress, openComments: 0, lastSend: null })).toBe('ready')
    expect(reviewStatusOf({ status: 'agent-working', progress: { reviewed: 1, total: 3 }, openComments: 0, lastSend: null })).toBe('in-progress')
    expect(reviewStatusOf({ status: 'agent-working', progress: { reviewed: 0, total: 3 }, openComments: 0, lastSend: null })).toBe('unreviewed')
    expect(reviewStatusOf({ status: 'updated', progress, openComments: 1, lastSend: sent })).toBe('updated')
  })

  it('lets an active run win over a failed newest run', () => {
    expect(runChipFor(true, 'failed')).toBe('working')
    expect(runChipFor(false, 'failed')).toBe('failed')
    expect(runChipFor(false, 'succeeded')).toBeNull()
    expect(runChipFor(false, undefined)).toBeNull()
  })

  it('files a session under its review status while a run is on', () => {
    const item = sessionSummary({ id: 'a', title: 'a', status: 'agent-working', progress, lastSend: sent })
    expect(countByFilter([item]).sent).toBe(1)
    expect(countByFilter([{ ...item, lastSend: null }]).ready).toBe(1)
  })
})
