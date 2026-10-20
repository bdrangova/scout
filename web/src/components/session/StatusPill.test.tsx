import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionSummary } from '@/test/fixtures'
import { StatusPill } from './StatusPill'

const sent = { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' as const }
const progress = { reviewed: 3, total: 3 }

function pill(status: 'sent' | 'agent-working' | 'run-failed') {
  return sessionSummary({ id: 'a', title: 'a', status, progress, lastSend: sent })
}

describe('StatusPill', () => {
  it('shows the review state alone when no run is active or failed', () => {
    const { container } = render(<StatusPill showWord summary={pill('sent')} />)
    expect(container.querySelector('[data-status="sent"]')).not.toBeNull()
    expect(container.querySelector('[data-run]')).toBeNull()
  })

  it('shows "Changes sent" plus an "Agent working" chip while the agent runs', () => {
    const { container } = render(<StatusPill showWord summary={pill('agent-working')} />)
    expect(container.querySelector('[data-status="sent"]')).toHaveTextContent('Changes sent')
    expect(container.querySelector('[data-run="working"]')).toHaveTextContent('Agent working')
  })

  it('shows "Changes sent" plus a "Run failed" chip in the err tone after a failed run', () => {
    const { container } = render(<StatusPill showWord summary={pill('run-failed')} />)
    expect(container.querySelector('[data-status="sent"]')).toHaveTextContent('Changes sent')
    expect(screen.getByLabelText('Run failed')).toHaveAttribute('data-run', 'failed')
  })
})
