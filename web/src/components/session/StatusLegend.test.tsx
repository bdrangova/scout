import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusLegend } from './StatusLegend'

describe('StatusLegend', () => {
  it('explains every status in a popover', async () => {
    render(<StatusLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'What do the statuses mean?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Session statuses' })
    for (const label of ['Awaiting review', 'In progress', 'Ready to submit', 'Changes sent', 'Updated since sent', 'Approved']) {
      expect(dialog).toHaveTextContent(label)
    }
  })
})
