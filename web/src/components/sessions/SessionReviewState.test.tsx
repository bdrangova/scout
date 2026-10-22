import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionSummary } from '@/test/fixtures'
import { SessionReviewState } from './SessionReviewState'

const lastSend = { at: '2026-10-01T10:00:00.000Z', decision: 'approve' as const }

describe('Dashboard review language', () => {
  it('does not describe a changed review as approved just because an approval was sent earlier', () => {
    render(<SessionReviewState session={sessionSummary({ id: 'changed', title: 'Changed review', status: 'sent', lastSend })} />)
    expect(screen.getByRole('status', { name: 'Review sent · Approval submitted' })).toHaveAttribute('data-status', 'sent')
    expect(screen.queryByRole('status', { name: 'Approved' })).not.toBeInTheDocument()
  })

  it('keeps a failed run separate from the submitted review and its decision', () => {
    render(<SessionReviewState session={sessionSummary({ id: 'failed', title: 'Failed run', status: 'run-failed', lastSend: { ...lastSend, decision: 'request-changes' } })} />)
    expect(screen.getByRole('status', { name: 'Review sent · Changes requested' })).toHaveAttribute('data-status', 'sent')
    expect(screen.getByRole('status', { name: 'Run failed' })).toHaveAttribute('data-run', 'failed')
  })
})
