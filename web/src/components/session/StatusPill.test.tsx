import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionSummary } from '@/test/fixtures'
import { StatusPill } from './StatusPill'

const sent = { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' as const }
const progress = { reviewed: 3, total: 3 }

describe('StatusPill', () => {
  it('shows the review state alone', () => {
    const summary = sessionSummary({ id: 'a', title: 'a', status: 'sent', progress, lastSend: sent })
    const { container } = render(<StatusPill showWord summary={summary} />)
    expect(container.querySelector('[data-status="sent"]')).toHaveTextContent('Changes sent')
    expect(container.querySelector('[data-run]')).toBeNull()
  })
})
