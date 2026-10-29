import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionSummary, testRunSummary } from '@/test/fixtures'
import { SessionReviewState } from './SessionReviewState'

const lastSend = { at: '2026-10-01T10:00:00.000Z', decision: 'approve' as const }

describe('Dashboard review language', () => {
  it('does not describe a changed review as approved just because an approval was sent earlier', () => {
    render(<SessionReviewState session={sessionSummary({ id: 'changed', title: 'Changed review', status: 'sent', lastSend })} />)
    expect(screen.getByRole('status', { name: 'Review sent · Approval submitted' })).toHaveAttribute('data-status', 'sent')
    expect(screen.queryByRole('status', { name: 'Approved' })).not.toBeInTheDocument()
  })

  it('describes test-run progress in scenarios rather than files', () => {
    render(<SessionReviewState session={testRunSummary({ id: 'run', title: 'Run', status: 'in-progress', reviewed: 1, total: 3 })} />)
    expect(screen.getByText('1 of 3 scenarios reviewed')).toBeInTheDocument()
    expect(screen.queryByText(/files reviewed/)).not.toBeInTheDocument()
  })

})
