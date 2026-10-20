import type { Ticket } from '@review-dash/shared'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TicketStrip } from './TicketStrip'

const tickets: Ticket[] = [
  { key: 'QI-1', url: 'https://example.test/QI-1' },
  { key: 'QI-2', url: null },
  { key: 'QI-3', url: 'https://example.test/QI-3' },
]

describe('TicketStrip', () => {
  it('renders nothing without tickets', () => {
    const { container } = render(<TicketStrip tickets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every ticket in a named group, links only those with a url', () => {
    render(<TicketStrip tickets={tickets} />)
    const group = screen.getByRole('group', { name: 'Tickets' })
    expect(within(group).getAllByText(/^QI-/).map((el) => el.textContent)).toEqual(['QI-1', 'QI-2', 'QI-3'])
    expect(within(group).getAllByRole('link').map((el) => el.getAttribute('href'))).toEqual(['https://example.test/QI-1', 'https://example.test/QI-3'])
  })

  it('is not focusable or masked when nothing is clipped (a single ticket, or no layout)', () => {
    render(<TicketStrip tickets={tickets.slice(0, 1)} />)
    const group = screen.getByRole('group', { name: 'Tickets' })
    expect(group).not.toHaveAttribute('tabindex')
    expect(group.style.maskImage).toBe('')
  })
})
